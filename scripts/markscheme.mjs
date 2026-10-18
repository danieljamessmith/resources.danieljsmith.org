/**
 * Mark schemes: read a pack, check, parse, write, format, stamp and
 * renumber a scheme, and report each scheme's state.
 *
 * Usage (through npm, flags need `--` before them):
 *   npm run markscheme -- pack <qbt.tex> [--json]
 *   npm run markscheme -- check [<yaml> ... | <scope>] [--warnings] [--draft]
 *   npm run markscheme -- check --question <json> --pack <qbt.tex> [--codes <json>] --json
 *   npm run markscheme -- parse <yaml> [--question N]
 *   npm run markscheme -- write <json> --to <yaml> [--only "3, 5"]
 *   npm run markscheme -- format <yaml>
 *   npm run markscheme -- stamp <yaml> --only "3, 5"
 *   npm run markscheme -- renumber <yaml>
 *   npm run markscheme -- status [<scope> | <id>]
 *
 *   scope    further-maths (default) | all | a folder under public/tex
 *
 * A `<json>` of `-` is read from stdin. `scripts/README.md` has the details.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkQuestion,
  checkScheme,
  emitScheme,
  packJson,
  packPaths,
  parseCodes,
  parseOnly,
  parseYaml,
  partLabel,
  qbtPathForScheme,
  readPack,
  renumberScheme,
  schemeStatus,
  spliceQuestions,
  stampQuestions,
  writableProblems,
} from './lib/markscheme.mjs';
import { loadResourcesEntries } from './lib/resources-derive.mjs';
import { findPackPairs, normalizePath } from './lib/tex-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');
export const CONVENTIONS_FILE = 'public/tex/_shared/markscheme_conventions.tex';

const VALUE_FLAGS = {
  pack: [],
  check: ['--question', '--pack', '--codes'],
  parse: ['--question'],
  write: ['--to', '--only'],
  format: [],
  stamp: ['--only'],
  renumber: [],
  status: [],
};
const BOOLEAN_FLAGS = {
  pack: ['--json'],
  check: ['--warnings', '--draft', '--json'],
  parse: [],
  write: [],
  format: [],
  stamp: [],
  renumber: [],
  status: [],
};

class UsageError extends Error {}

/**
 * @param {string[]} argv
 * @returns {{ command: string, args: string[], flags: Record<string, string | true> }}
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || !(command in VALUE_FLAGS)) {
    throw new UsageError(`expected a command: ${Object.keys(VALUE_FLAGS).join(', ')}`);
  }
  const args = [];
  /** @type {Record<string, string | true>} */
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const [name, inline] = a.split(/=(.*)/s);
      if (VALUE_FLAGS[command].includes(name)) {
        const value = inline ?? rest[++i];
        if (value === undefined) throw new UsageError(`${name} needs a value`);
        flags[name] = value;
      } else if (BOOLEAN_FLAGS[command].includes(name) && inline === undefined) {
        flags[name] = true;
      } else {
        throw new UsageError(`${command}: unknown flag ${a}`);
      }
    } else {
      args.push(a);
    }
  }
  return { command, args, flags };
}

const rel = (p) => normalizePath(relative(repoRoot, p));

function readInput(path) {
  return path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
}

function readJson(path) {
  try {
    return JSON.parse(readInput(path));
  } catch (e) {
    throw new UsageError(`${path}: ${e.message}`);
  }
}

/** Writes `text` (LF) in the line endings the file already has, atomically. */
function writeAtomic(path, text) {
  let out = text;
  if (existsSync(path)) {
    const old = readFileSync(path, 'utf8');
    const crlf = (old.match(/\r\n/g) ?? []).length;
    const lf = (old.match(/(?<!\r)\n/g) ?? []).length;
    if (crlf > lf) out = text.replace(/\n/g, '\r\n');
  }
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, out, 'utf8');
  renameSync(tmp, path);
}

function formatProblem(file, p, kind = 'error') {
  const where = p.where === 'file' ? '' : ` ${p.where}:`;
  return `${kind === 'warning' ? '  (warn) ' : ''}${file}:${where} [rule ${p.rule}] ${p.message}`;
}

/** A canonical scheme file, parsed, for an edit that leaves the rest byte for byte. */
function readCanonical(path) {
  if (!existsSync(path)) throw new UsageError(`no scheme at ${path}`);
  const text = readFileSync(path, 'utf8');
  const parsed = parseYaml(text);
  if (parsed.errors.length) throw new UsageError(`${path} does not parse: ${parsed.errors[0].message}`);
  const problems = writableProblems(parsed.value);
  if (problems.length) throw new UsageError(problems.map((p) => formatProblem(path, p)).join('\n'));
  if (emitScheme(parsed.value) !== text.replace(/\r\n/g, '\n')) {
    throw new UsageError(`${path} is not in canonical form: run \`npm run markscheme -- format ${path}\` first`);
  }
  return parsed.value;
}

function resolveScope(scope) {
  if (scope === 'all') return texRoot;
  return join(texRoot, scope);
}

function findSchemes(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'build') findSchemes(full, acc);
    } else if (/^_QBT___MS__.+\.yaml$/.test(entry.name) && basename(dir) === 'ms') {
      acc.push(full);
    }
  }
  return acc.sort();
}

function isFileArg(a) {
  return a.endsWith('.yaml') || (existsSync(a) && statSync(a).isFile());
}

// ---- Commands -----------------------------------------------------------------

function cmdPack({ args, flags }) {
  if (args.length !== 1) throw new UsageError('pack <qbt.tex> [--json]');
  const { paths, pack } = readPack(resolve(args[0]));
  if (flags['--json']) {
    const json = packJson(pack, {
      questions: rel(paths.qbt),
      solutions: rel(paths.soln),
      scheme: rel(paths.scheme),
      conventions: CONVENTIONS_FILE,
    });
    process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    return 0;
  }
  const rows = pack.questions.flatMap((q) => q.parts.map((p) => [partLabel(q.q, p.part), p.marks]));
  const width = Math.max(2, ...rows.map(([l]) => l.length));
  for (const [l, n] of rows) console.log(`${l.padEnd(width)}  ${n}`);
  const totals = pack.questions.map((q) => [q.q, q.parts.reduce((s, p) => s + p.marks, 0)]);
  console.log(
    `Totals: ${totals.map(([q, t]) => `Q${q} ${t}`).join(', ')}; pack ${totals.reduce((s, [, t]) => s + t, 0)} in ` +
      `${totals.length} questions, ${rows.length} parts`,
  );
  return 0;
}

function cmdCheckQuestion({ args, flags }) {
  if (args.length) throw new UsageError('check --question <json> --pack <qbt.tex> [--codes <json>] --json');
  if (!flags['--pack']) throw new UsageError('check --question needs --pack <qbt.tex>');
  const question = readJson(flags['--question']);
  const { pack } = readPack(resolve(flags['--pack']));
  let codes = null;
  if (flags['--codes']) {
    try {
      codes = parseCodes(readJson(flags['--codes']));
    } catch (e) {
      throw new UsageError(e.message);
    }
  }
  const result = checkQuestion(question, pack, { codes });
  if (flags['--json']) {
    process.stdout.write(`${JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2)}\n`);
  } else {
    for (const p of result.errors) console.error(formatProblem('question', p));
    for (const p of result.warnings) console.error(formatProblem('question', p, 'warning'));
    console.log(`markscheme check: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  }
  return result.errors.length ? 1 : 0;
}

function cmdCheck(parsed) {
  const { args, flags } = parsed;
  if (flags['--question'] !== undefined) return cmdCheckQuestion(parsed);
  if (flags['--pack'] || flags['--codes'] || flags['--json']) {
    throw new UsageError('--pack, --codes and --json go with check --question');
  }
  let files;
  let scope = null;
  if (args.length && args.every(isFileArg)) {
    files = args.map((a) => resolve(a));
  } else if (args.length <= 1) {
    scope = args[0] ?? 'further-maths';
    if (!existsSync(resolveScope(scope))) throw new UsageError(`${scope} is neither a scheme file nor a scope under public/tex`);
    files = findSchemes(resolveScope(scope));
  } else {
    throw new UsageError('check [<yaml> ... | <scope>]');
  }
  let errors = 0;
  let warnings = 0;
  for (const file of files) {
    const name = rel(file);
    let result;
    try {
      const { pack } = readPack(qbtPathForScheme(file));
      result = checkScheme(readFileSync(file, 'utf8'), pack, { draft: Boolean(flags['--draft']) });
    } catch (e) {
      console.error(`${name}: ${e.message}`);
      errors++;
      continue;
    }
    for (const p of result.errors) console.error(formatProblem(name, p));
    if (flags['--warnings']) for (const p of result.warnings) console.error(formatProblem(name, p, 'warning'));
    errors += result.errors.length;
    warnings += result.warnings.length;
  }
  const shown = warnings && !flags['--warnings'] ? ' (shown with --warnings)' : '';
  const summary =
    `markscheme check: ${files.length} scheme(s), ${errors} error(s), ${warnings} warning(s)${shown}` +
    (scope ? ` | scope=${scope}` : '');
  if (errors) {
    console.error(summary);
    return 1;
  }
  console.log(summary);
  return 0;
}

function cmdParse({ args, flags }) {
  if (args.length !== 1) throw new UsageError('parse <yaml> [--question N]');
  const parsed = parseYaml(readInput(args[0]));
  if (parsed.errors.length) {
    for (const e of parsed.errors) console.error(`${args[0]}:${e.line ? `${e.line}:` : ''} ${e.message}`);
    return 1;
  }
  let value = parsed.value;
  if (flags['--question'] !== undefined) {
    const [n] = parseOnly(flags['--question']);
    const questions = value && Array.isArray(value.questions) ? value.questions : [];
    value = questions.find((q) => q && q.q === n);
    if (!value) throw new UsageError(`${args[0]} has no question ${n}`);
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return 0;
}

function cmdWrite({ args, flags }) {
  if (args.length !== 1 || !flags['--to']) throw new UsageError('write <json> --to <yaml> [--only "3, 5"]');
  const data = readJson(args[0]);
  const to = flags['--to'];
  let scheme;
  if (flags['--only'] !== undefined) {
    const only = parseOnly(flags['--only']);
    const target = readCanonical(to);
    const incoming = Array.isArray(data)
      ? data
      : data && Array.isArray(data.questions)
        ? data.questions
        : [data];
    try {
      scheme = spliceQuestions(target, incoming, only);
    } catch (e) {
      throw new UsageError(e.message);
    }
  } else {
    scheme = data;
  }
  const problems = writableProblems(scheme);
  if (problems.length) {
    for (const p of problems) console.error(formatProblem(args[0], p));
    console.error('markscheme write: nothing written');
    return 1;
  }
  writeAtomic(to, emitScheme(scheme));
  console.log(`markscheme write: ${to}${flags['--only'] ? ` (questions ${flags['--only']})` : ''}`);
  return 0;
}

function cmdFormat({ args }) {
  if (args.length !== 1) throw new UsageError('format <yaml>');
  const [file] = args;
  const text = readFileSync(file, 'utf8');
  const parsed = parseYaml(text);
  if (parsed.errors.length) {
    for (const e of parsed.errors) console.error(`${file}:${e.line ? `${e.line}:` : ''} ${e.message}`);
    return 1;
  }
  const problems = writableProblems(parsed.value);
  if (problems.length) {
    for (const p of problems) console.error(formatProblem(file, p));
    console.error('markscheme format: nothing written');
    return 1;
  }
  const out = emitScheme(parsed.value);
  if (out === text.replace(/\r\n/g, '\n')) {
    console.log(`markscheme format: ${file} already canonical`);
    return 0;
  }
  writeAtomic(file, out);
  console.log(`markscheme format: ${file} rewritten`);
  return 0;
}

function cmdStamp({ args, flags }) {
  if (args.length !== 1 || flags['--only'] === undefined) throw new UsageError('stamp <yaml> --only "3, 5"');
  const [file] = args;
  const only = parseOnly(flags['--only']);
  const scheme = readCanonical(file);
  const { pack } = readPack(qbtPathForScheme(resolve(file)));
  let stamped;
  try {
    stamped = stampQuestions(scheme, pack, only);
  } catch (e) {
    throw new UsageError(e.message);
  }
  for (const n of only) {
    const before = scheme.questions.find((q) => q.q === n).stamp;
    const after = stamped.questions.find((q) => q.q === n).stamp;
    console.log(before === after ? `  Q${n}: ${after} (unchanged)` : `  Q${n}: ${before} -> ${after}`);
  }
  writeAtomic(file, emitScheme(stamped));
  console.log(`markscheme stamp: ${file}`);
  return 0;
}

function cmdRenumber({ args }) {
  if (args.length !== 1) throw new UsageError('renumber <yaml>');
  const [file] = args;
  const scheme = readCanonical(file);
  const { pack } = readPack(qbtPathForScheme(resolve(file)));
  let result;
  try {
    result = renumberScheme(scheme, pack);
  } catch (e) {
    console.error(e.message);
    console.error('markscheme renumber: nothing written');
    return 1;
  }
  for (const [from, to] of result.moves) console.log(`  Q${from} -> Q${to}`);
  writeAtomic(file, emitScheme(result.scheme));
  console.log(`markscheme renumber: ${file}, ${result.moves.length} question(s) moved`);
  return 0;
}

/** The questions file a catalogue id names: the questions, solutions or mark scheme id. */
function qbtForId(id) {
  const entries = loadResourcesEntries();
  const byId = new Map(entries.map((e) => [e.id, e]));
  let entry = byId.get(id) ?? (id.endsWith('-ms') ? byId.get(id.slice(0, -3)) : undefined);
  if (entry && entry.type === 'solutions') entry = byId.get(entry.pairId);
  if (!entry || entry.type !== 'questions' || !entry.file.includes('/qbt/')) return null;
  return join(repoRoot, 'public', entry.file.replace(/\.pdf$/, '.tex'));
}

function cmdStatus({ args }) {
  if (args.length > 1) throw new UsageError('status [<scope> | <id>]');
  const arg = args[0] ?? 'further-maths';
  let qbts;
  const single = existsSync(resolveScope(arg)) ? null : qbtForId(arg);
  if (single) qbts = [single];
  else if (existsSync(resolveScope(arg))) qbts = findPackPairs(resolveScope(arg), repoRoot).pairs.map((p) => p.qbtPath);
  else throw new UsageError(`${arg} is neither a scope under public/tex nor a pack's id`);

  const groups = { broken: [], stale: [], current: [] };
  let without = 0;
  for (const qbt of qbts) {
    const { scheme } = packPaths(qbt);
    if (!existsSync(scheme)) {
      without++;
      continue;
    }
    const name = rel(scheme);
    let status;
    try {
      const { pack } = readPack(qbt);
      status = schemeStatus(readFileSync(scheme, 'utf8'), pack);
    } catch (e) {
      groups.broken.push(`  ${name}  (${e.message})`);
      continue;
    }
    const rules = (q) => [...new Set(status.errors.filter((e) => e.q === q).map((e) => e.rule))].join(', ');
    if (status.fileErrors.length || status.broken.length) {
      const parts = [];
      if (status.fileErrors.length) parts.push(`file (rule ${[...new Set(status.fileErrors.map((e) => e.rule))].join(', ')})`);
      for (const q of status.broken) parts.push(`Q${q} (rule ${rules(q)})`);
      groups.broken.push(`  ${name}  ${parts.join(', ')}`);
    }
    if (status.stale.length) groups.stale.push(`  ${name}  ${status.stale.map((q) => `Q${q}`).join(', ')}`);
    if (!status.fileErrors.length && !status.broken.length && !status.stale.length) groups.current.push(`  ${name}`);
  }
  for (const [key, heading] of [
    ['broken', 'Broken (run check)'],
    ['stale', 'Stale (statement or solution changed since the stamp)'],
    ['current', 'In step'],
  ]) {
    if (!groups[key].length) continue;
    console.log(`${heading}:`);
    for (const line of groups[key]) console.log(line);
    console.log('');
  }
  const schemes = qbts.length - without;
  console.log(
    `markscheme status: ${schemes} scheme(s) | ${groups.broken.length} broken, ${groups.stale.length} stale, ` +
      `${groups.current.length} in step | ${without} pack(s) without a scheme | ${single ? `id=${arg}` : `scope=${arg}`}`,
  );
  return 0;
}

const COMMANDS = {
  pack: cmdPack,
  check: cmdCheck,
  parse: cmdParse,
  write: cmdWrite,
  format: cmdFormat,
  stamp: cmdStamp,
  renumber: cmdRenumber,
  status: cmdStatus,
};

export function main(argv = process.argv.slice(2)) {
  try {
    const parsed = parseArgs(argv);
    return COMMANDS[parsed.command](parsed);
  } catch (e) {
    console.error(`markscheme: ${e.message}`);
    return e instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
