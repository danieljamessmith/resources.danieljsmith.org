/**
 * Import a Further Maths pack into the site from a local folder holding its
 * questions and solutions documents (named by `pack.json` when there is one).
 *
 * It places them under `public/tex/further-maths/<strand>/<section>/{qbt,soln}/`,
 * sets the header title and `\djsSitePath`, strips comments, compiles both
 * PDFs, writes the pack's two rows into `src/data/resources.ts` after the
 * section's last pack, and regenerates the generated data files. If any of
 * that fails, everything it wrote is put back.
 *
 * Usage:
 *   npm run import-pack -- [--folder DIR] [--site-path STRAND/SECTION]
 *     [--section NAME] [--title TITLE] [--boards IDS|all] [--id ID] [--yes]
 *
 * Without `--yes`, anything not given is asked. With `--yes` nothing is asked:
 * `--folder`, `--site-path`, `--title`, `--boards` and `--id` must all be
 * given, with `--section` for a section folder that holds no pack yet, and a
 * failed compile is an error. See `scripts/README.md` for each flag.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { stdin, stdout } from 'node:process';

import { processContent } from './clean-tex.mjs';
import { listTreeShallow, pickSitePath } from './lib/site-tree.mjs';
import {
  formatPackDate,
  hasMechanicsPack,
  isFurtherMechanicsPackPath,
  MECHANICS_PACK_COMMAND,
  normalizeImportedPackTex,
  stripPreambleComments,
  usesOverleafPackInput,
} from './lib/pack-preamble.mjs';
import {
  derivePathContext,
  deriveTopicId,
  findStrandTopic,
  loadResourcesEntries,
  loadStrands,
  sitePathLabels,
  slugify,
} from './lib/resources-derive.mjs';
import { insertPackRows, solutionsId, verifyPackRows } from './lib/resources-write.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const fmRoot = join(repoRoot, 'public', 'tex', 'further-maths');
const resourcesPath = join(repoRoot, 'src', 'data', 'resources.ts');

/** Scratch files a pack folder may hold that are never a pack document. */
export const SKIP_TEX_FILES = new Set(['draft.tex', 'original.tex']);

/** A failure to report and stop on, without a stack trace. */
class ImportError extends Error {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace every non-alphanumeric character with an underscore. */
export function sanitizeTopic(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Prompt for exam boards from the strand's list (numbered multi-select).
 * Returns `null` = all boards.
 * @param {import('node:readline/promises').Interface} rl
 * @param {string[]} boardIds - the strand's boards, in its order
 * @param {string[]} [sectionBoards] - boards the section's other packs use
 */
export async function promptExamBoards(rl, boardIds, sectionBoards = []) {
  console.log('\nExam boards:');
  console.log('  1. All boards (default)');
  boardIds.forEach((id, i) => console.log(`  ${i + 2}. ${id}`));
  if (sectionBoards.length > 0) {
    console.log(`  (this section's other packs use: ${sectionBoards.join(', ')})`);
  }

  for (;;) {
    const line = await rl.question('Select boards (comma-separated numbers, Enter for all): ');
    const result = parseBoardSelection(line, boardIds);
    if (result.ok) return result.boardIds;
    console.error(`  ${result.message}`);
  }
}

/**
 * A numbered board selection: 1 for all boards, 2 onwards for the strand's
 * boards in its order.
 * @param {string} line
 * @param {string[]} boardIds - the strand's boards
 * @returns {{ ok: true, boardIds: string[] | null } | { ok: false, message: string }}
 */
export function parseBoardSelection(line, boardIds) {
  const t = line.trim();
  if (!t) return { ok: true, boardIds: null };
  const last = boardIds.length + 1;

  const parts = t.split(/[\s,]+/).filter(Boolean);
  const nums = parts.map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n));

  if (nums.length === 0) {
    return { ok: false, message: `Enter numbers 1–${last}, or leave blank for all boards.` };
  }
  if (nums.some((n) => n < 1 || n > last)) {
    return { ok: false, message: `Each number must be between 1 and ${last}.` };
  }

  if (nums.includes(1)) {
    if (nums.length > 1) {
      return { ok: false, message: 'Option 1 (All boards) cannot be combined with other numbers.' };
    }
    return { ok: true, boardIds: null };
  }

  const unique = [...new Set(nums)].sort((a, b) => a - b);
  return { ok: true, boardIds: unique.map((n) => boardIds[n - 2]) };
}

/**
 * `--boards`: `all`, or board ids separated by commas or spaces, each one of
 * the strand's. Ids come back in the strand's order.
 * @param {string} value
 * @param {string[]} boardIds - the strand's boards
 * @returns {{ ok: true, boardIds: string[] | null } | { ok: false, message: string }}
 */
export function parseBoardsFlag(value, boardIds) {
  const t = value.trim();
  if (t.toLowerCase() === 'all') return { ok: true, boardIds: null };
  const ids = t.split(/[\s,]+/).filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, message: `--boards needs board ids or "all" (boards: ${boardIds.join(', ')})` };
  }
  const unknown = ids.filter((id) => !boardIds.includes(id));
  if (unknown.length > 0) {
    return {
      ok: false,
      message: `not a board of this strand: ${unknown.join(', ')} (boards: ${boardIds.join(', ')})`,
    };
  }
  return { ok: true, boardIds: boardIds.filter((id) => ids.includes(id)) };
}

/**
 * `--site-path`: `<strand folder>/<section folder>`, e.g. `core-pure/induction`.
 * A leading `further-maths/` is allowed.
 * @param {string} value
 * @returns {{ ok: true, strandFolder: string, sectionFolder: string } | { ok: false, message: string }}
 */
export function parseSitePathArg(value) {
  const parts = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^further-maths\//, '')
    .split('/');
  if (parts.length !== 2 || parts.some((p) => !p || p === '.' || p === '..')) {
    return {
      ok: false,
      message: `--site-path must be <strand folder>/<section folder>, e.g. core-pure/induction (got "${value}")`,
    };
  }
  return { ok: true, strandFolder: parts[0], sectionFolder: parts[1] };
}

/**
 * The site section a pack in this folder joins: the one the folder's packs
 * are filed under, or, for a folder with no packs yet, the one `--section`
 * names. Folder names need not match section names.
 *
 * @param {Object} p
 * @param {import('./lib/resources-derive.mjs').Strand} p.strand
 * @param {string} p.folder - `<strand folder>/<section folder>`, for messages
 * @param {{ topic?: string }[]} p.packRows - the folder's questions and solutions rows
 * @param {string} [p.sectionArg] - `--section`: a section's topic or heading
 * @returns {{ ok: true, topic: string } | { ok: false, message: string, needsSection?: boolean }}
 */
export function resolveSection({ strand, folder, packRows, sectionArg }) {
  const listed = strand.topics.map((t) => `"${t.topic}"`).join(', ');
  const named = sectionArg?.trim() ? findStrandTopic(strand, sectionArg) : undefined;
  if (sectionArg?.trim() && !named) {
    return { ok: false, message: `"${sectionArg}" is not a ${strand.title} section in topics.ts (sections: ${listed})` };
  }

  const topics = [...new Set(packRows.map((e) => e.topic))];
  if (topics.length > 1) {
    return {
      ok: false,
      message: `the packs in ${folder} are filed under more than one section: ${topics.map((t) => `"${t}"`).join(', ')}`,
    };
  }
  if (topics.length === 1) {
    const filed = strand.topics.find((t) => t.topic === topics[0]);
    if (!filed) {
      return { ok: false, message: `the packs in ${folder} are filed under "${topics[0]}", which is not a ${strand.title} section in topics.ts` };
    }
    if (named && named.topic !== filed.topic) {
      return {
        ok: false,
        message: `the packs in ${folder} are filed under "${filed.topic}", not "${named.topic}": pick that folder's section, or another folder`,
      };
    }
    return { ok: true, topic: filed.topic };
  }
  if (!named) {
    return {
      ok: false,
      needsSection: true,
      message: `${folder} holds no pack yet, so name its section with --section (sections: ${listed})`,
    };
  }
  return { ok: true, topic: named.topic };
}

/** Why `id` can't be a resource id, or null. */
export function resourceIdProblem(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    return `resource ids are lowercase letters, digits and single hyphens (got "${id}")`;
  }
  if (id.endsWith('-solns')) return `"${id}" ends in -solns: give the questions row's id`;
  return null;
}

/** True when the document includes an image file (in code, not a comment). */
export function usesIncludeGraphics(text) {
  return /\\includegraphics(?![A-Za-z@])/.test(text.replace(/(?<!\\)%[^\r\n]*/g, ''));
}

/**
 * Why the pack's documents can't be imported to this strand, or null: a
 * Further Mechanics pack calls `\djsMechanicsPack` in both preambles (its
 * stems leave g out on that basis), and no other pack calls it.
 * @param {{ name: string; text: string }[]} docs
 * @param {boolean} mechanics - importing into Further Mechanics
 */
export function mechanicsPackProblem(docs, mechanics) {
  const wrong = docs.filter((d) => hasMechanicsPack(d.text) !== mechanics).map((d) => d.name);
  if (wrong.length === 0) return null;
  return mechanics
    ? `a Further Mechanics pack calls ${MECHANICS_PACK_COMMAND} in its preamble; ${wrong.join(' and ')} ${wrong.length > 1 ? 'do' : 'does'} not`
    : `only Further Mechanics packs call ${MECHANICS_PACK_COMMAND}; remove it from ${wrong.join(' and ')}, or import into Further Mechanics`;
}

/**
 * Parse the source answer: a path to an existing local folder (quotes
 * allowed, as a shell copy may add them).
 * @param {string} input
 * @returns {{ kind: 'dir', dir: string } | null}
 */
export function parseSource(input) {
  const trimmed = input.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
  if (trimmed && existsSync(trimmed) && statSync(trimmed).isDirectory()) {
    return { kind: 'dir', dir: resolve(trimmed) };
  }
  return null;
}

/** Manifest a local pack folder may carry beside its two documents. */
export const PACK_MANIFEST = 'pack.json';

/**
 * Read a local pack folder's `pack.json`: its topic and the file names of the
 * questions and solutions documents. Returns `null` when the folder has none.
 * @param {string} dir
 * @returns {{ topic: string, questions: string, solutions: string } | null}
 */
export function readPackManifest(dir) {
  const manifestPath = join(dir, PACK_MANIFEST);
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest?.format !== 1) {
    throw new Error(`${PACK_MANIFEST}: unsupported format ${JSON.stringify(manifest?.format)}`);
  }
  for (const key of ['topic', 'questions', 'solutions']) {
    const value = manifest[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${PACK_MANIFEST}: "${key}" must be a non-empty string`);
    }
    if (key !== 'topic' && basename(value) !== value) {
      throw new Error(`${PACK_MANIFEST}: "${key}" must be a file name, not a path`);
    }
  }
  return { topic: manifest.topic, questions: manifest.questions, solutions: manifest.solutions };
}

/**
 * Resolve qbt + soln paths in a local folder: straight from `pack.json` when
 * given, otherwise by file-name discovery.
 * @param {string} dir
 * @param {string} topicName
 * @param {{ questions: string, solutions: string } | null} manifest
 * @returns {{ qbtPath: string | null, solnPath: string | null }}
 */
export function resolveTexPairFromDir(dir, topicName, manifest) {
  if (!manifest) return resolveTexPairFromClone(dir, topicName);
  const qbtPath = join(dir, manifest.questions);
  const solnPath = join(dir, manifest.solutions);
  for (const path of [qbtPath, solnPath]) {
    if (!existsSync(path)) {
      throw new Error(`${basename(path)} is listed in ${PACK_MANIFEST} but missing from ${dir}`);
    }
  }
  return { qbtPath, solnPath };
}

/**
 * Prompt for the pack title, offering `defaultTopic` (from `pack.json`) on Enter.
 * @param {import('node:readline/promises').Interface} rl
 * @param {string | null | undefined} defaultTopic
 */
export async function promptTopic(rl, defaultTopic) {
  const hint = defaultTopic ? `default "${defaultTopic}"` : 'e.g. "Matrix Determinants & Inverses"';
  const answer = (await rl.question(`\nPack title (${hint}): `)).trim();
  return answer || defaultTopic || answer;
}

/**
 * @param {string} name - basename of a `.tex` file
 * @returns {'qbt' | 'soln' | 'unknown'}
 */
export function classifyTexBasename(name) {
  if (name.includes('[Solns]')) return 'soln';
  if (name.startsWith('(QBT) ') && !name.includes('[Solns]')) return 'qbt';
  return 'unknown';
}

/**
 * Tiered discovery of the main pack `.tex` in a pack folder without `pack.json`.
 * @param {string} dir
 * @param {'qbt' | 'soln'} kind
 * @param {string} topicName
 * @returns {string | null}
 */
export function findPackTex(dir, kind, topicName) {
  const exactName =
    kind === 'qbt' ? `(QBT) ${topicName}.tex` : `(QBT) [Solns] ${topicName}.tex`;
  const exactPath = join(dir, exactName);
  if (existsSync(exactPath)) {
    const c = readFileSync(exactPath, 'utf8');
    if (c.includes('\\begin{document}')) return exactPath;
  }

  const texFiles = readdirSync(dir).filter((f) => f.endsWith('.tex') && !SKIP_TEX_FILES.has(f));

  const withDoc = [];
  for (const f of texFiles) {
    const full = join(dir, f);
    const content = readFileSync(full, 'utf8');
    if (content.includes('\\begin{document}')) withDoc.push({ name: f, path: full });
  }

  if (withDoc.length === 0) {
    throw new Error(`No .tex with \\\\begin{document} in ${dir}`);
  }

  if (withDoc.length === 1) {
    const only = withDoc[0];
    const cls = classifyTexBasename(only.name);
    if (cls === 'unknown' || cls === kind) return only.path;
    throw new Error(
      `Could not find ${kind} .tex for "${topicName}". The single candidate "${only.name}" classifies as ${cls}.`,
    );
  }

  const qbt = [];
  const soln = [];
  for (const w of withDoc) {
    if (w.name.includes('[Solns]')) soln.push(w.path);
    else if (w.name.startsWith('(QBT) ') && !w.name.includes('[Solns]')) qbt.push(w.path);
  }

  const pool = kind === 'qbt' ? qbt : soln;
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) {
    throw new Error(
      `Ambiguous ${kind}: multiple candidates: ${pool.map((p) => basename(p)).join(', ')}`,
    );
  }

  throw new Error(
    `Could not find ${kind} .tex for "${topicName}". Files with \\\\begin{document}: ${withDoc.map((w) => w.name).join(', ')}`,
  );
}

/**
 * Like `findPackTex`, but returns `null` when that kind is missing.
 * Still throws on ambiguous matches or when the folder has no `\\begin{document}` .tex at all.
 * @param {string} dir
 * @param {'qbt' | 'soln'} kind
 * @param {string} topicName
 * @returns {string | null}
 */
export function tryFindPackTex(dir, kind, topicName) {
  try {
    return findPackTex(dir, kind, topicName);
  } catch (e) {
    const msg = String(e.message ?? e);
    if (msg.includes('Ambiguous')) throw e;
    if (msg.includes('No .tex with')) throw e;
    return null;
  }
}

/**
 * Resolve qbt + soln paths in one folder by file name; split a single
 * unclassifiable file found for both kinds by its name.
 * @returns {{ qbtPath: string | null, solnPath: string | null }}
 */
export function resolveTexPairFromClone(dir, topicName) {
  let qbtPath = tryFindPackTex(dir, 'qbt', topicName);
  let solnPath = tryFindPackTex(dir, 'soln', topicName);

  if (qbtPath && solnPath && qbtPath === solnPath) {
    const kind = classifyTexBasename(basename(qbtPath));
    if (kind === 'qbt') solnPath = null;
    else if (kind === 'soln') qbtPath = null;
    else {
      solnPath = null;
    }
  }

  return { qbtPath, solnPath };
}

/**
 * What to show of a failed compile: the `file:line: message` errors that
 * `-file-line-error` writes to the LaTeX log (each with the line after it,
 * which holds the offending source), else the tail of latexmk's output.
 * @param {string} log - the LaTeX `.log`, or '' when there is none
 * @param {string} output - latexmk's stdout and stderr
 */
export function compileFailureSummary(log, output) {
  const lines = log.split(/\r?\n/);
  const errors = [];
  lines.forEach((line, i) => {
    if (/^\S.*\.tex:\d+: /.test(line)) errors.push(line, ...lines.slice(i + 1, i + 2).filter((l) => l.trim()));
  });
  return (errors.length > 0 ? errors.slice(0, 20) : output.split(/\r?\n/).slice(-30)).join('\n');
}

/**
 * Compile a placed `.tex` into its `build/` folder with the latexmk arguments
 * the editor uses. Returns the PDF's path, or what went wrong.
 * @param {string} texFilePath
 * @returns {{ ok: true, pdf: string } | { ok: false, log: string }}
 */
function compileTex(texFilePath) {
  const texDir = dirname(texFilePath);
  const texName = basename(texFilePath);
  const outDir = join(texDir, 'build');
  const result = spawnSync(
    'latexmk',
    [
      '-pdf',
      '-cd',
      '-interaction=nonstopmode',
      '-synctex=1',
      '-file-line-error',
      `-auxdir=${join(outDir, 'aux')}`,
      `-outdir=${outDir}`,
      texName,
    ],
    { cwd: texDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const pdf = join(outDir, texName.replace(/\.tex$/, '.pdf'));
  if (result.status === 0 && existsSync(pdf)) return { ok: true, pdf };
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`;
  const logPath = join(outDir, 'aux', texName.replace(/\.tex$/, '.log'));
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  return { ok: false, log: compileFailureSummary(log, output) };
}

function repoRel(path) {
  return path.slice(repoRoot.length + 1).replace(/\\/g, '/');
}

/** Write through a temporary file, so a reader never sees half a file. */
function writeAtomic(path, text) {
  const tmp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

/**
 * A pack document as it is placed on the site: in the shared-preamble
 * wrapper, with its header title and site path set (`identity`), dated if it
 * was undated, and with no full-line comment left except the question
 * delimiters and source hints. Preamble comments go here; the body is
 * cleaned as clean-tex cleans it.
 *
 * @param {string} raw
 * @param {string} relFromRepo - where it is placed, e.g. `public/tex/further-maths/…/qbt/_QBT__X.tex`
 * @param {{ title?: string; strand?: string; section?: string }} [identity]
 * @param {string} [initialDate] - for an undated document
 */
export function prepareImportedTex(raw, relFromRepo, identity, initialDate = formatPackDate()) {
  const normalized = normalizeImportedPackTex(raw, relFromRepo, initialDate, identity);
  return processContent(stripPreambleComments(normalized), basename(relFromRepo, '.tex'));
}

/**
 * Read a pack document, prepare it for the site (`prepareImportedTex`) and
 * write it to `destPath`.
 * @param {string} srcPath
 * @param {string} destPath
 * @param {{ title?: string; strand?: string; section?: string }} [identity]
 *   - header topic and site path to write (see `applyPackIdentity`)
 */
function copyNormalizedPackTex(srcPath, destPath, identity) {
  const raw = readFileSync(srcPath, 'utf8');
  if (usesOverleafPackInput(raw) && !existsSync(join(dirname(srcPath), 'preamble.tex'))) {
    console.warn(
      `Warning: ${basename(srcPath)} imports preamble.tex, but no bundled preamble.tex was found beside it; using the site shared pack preamble.`,
    );
  }
  writeFileSync(destPath, prepareImportedTex(raw, repoRel(destPath), identity), 'utf8');
}

/**
 * What an imported Further Maths pack's header and site path should say: the
 * pack title (which is also its site title) and the strand and topic section
 * the site lists it under. Other packs are left as they are.
 *
 * @param {string} sitePath - e.g. `further-maths/core-pure/vectors`
 * @param {string} topicName - the pack title
 * @param {{ category: string; topic: string }} ctx
 * @param {import('./lib/resources-derive.mjs').Strand[]} strands
 */
export function importedPackIdentity(sitePath, topicName, ctx, strands) {
  if (!sitePath.replace(/\\/g, '/').startsWith('further-maths/')) return undefined;
  const labels = sitePathLabels(strands, ctx.category, ctx.topic);
  return labels ? { title: topicName, ...labels } : { title: topicName };
}

// Re-export for tests / tooling
export { derivePathContext, deriveTopicId, slugify, copyNormalizedPackTex };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OPTIONS = {
  folder: { type: 'string' },
  'site-path': { type: 'string' },
  section: { type: 'string' },
  title: { type: 'string' },
  boards: { type: 'string' },
  id: { type: 'string' },
  yes: { type: 'boolean', default: false },
};

/**
 * The command line's options.
 * @param {string[]} argv
 */
export function parseImportArgs(argv) {
  try {
    return parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false }).values;
  } catch (e) {
    throw new ImportError(e.message);
  }
}

/**
 * With `--yes`, the options that must be given and weren't. `--section` is
 * needed only for a section folder with no pack yet, so it is checked later.
 * @param {Record<string, string | boolean | undefined>} opts
 */
export function missingForYes(opts) {
  return ['folder', 'site-path', 'title', 'boards', 'id'].filter(
    (key) => typeof opts[key] !== 'string' || !opts[key].trim(),
  );
}

/**
 * Asks a question in a terminal; refuses when there is none, so a run
 * without `--yes` and without a terminal fails instead of waiting.
 */
function makeAsker(yes) {
  if (yes) {
    return {
      rl: null,
      ask: () => {
        throw new ImportError('with --yes nothing is asked');
      },
    };
  }
  const rl = stdin.isTTY ? createInterface({ input: stdin, output: stdout }) : null;
  return {
    rl,
    ask: async (question) => {
      if (!rl) {
        throw new ImportError(`no terminal to ask on (${question.trim()}): pass the flags, with --yes`);
      }
      return rl.question(question);
    },
  };
}

async function main() {
  const opts = parseImportArgs(process.argv.slice(2));
  const yes = opts.yes;
  if (yes) {
    const missing = missingForYes(opts);
    if (missing.length > 0) {
      throw new ImportError(`with --yes, give ${missing.map((k) => `--${k}`).join(', ')}`);
    }
  }
  const { rl, ask } = makeAsker(yes);
  const asking = { question: ask };

  try {
    // --- The pack folder, its documents and title -------------------------
    let folder = opts.folder !== undefined ? parseSource(opts.folder) : null;
    if (opts.folder !== undefined && !folder) throw new ImportError(`not a folder: ${opts.folder}`);
    while (!folder) {
      const answer = await ask('\nPack folder (the folder holding its two .tex files): ');
      folder = parseSource(answer);
      if (!folder) console.error(`  Not an existing folder: ${answer}`);
    }
    const dir = folder.dir;

    let manifest;
    try {
      manifest = readPackManifest(dir);
    } catch (e) {
      throw new ImportError(e.message);
    }
    console.log(
      manifest
        ? `Using ${PACK_MANIFEST} in ${dir}`
        : `No ${PACK_MANIFEST} in ${dir}; finding the two .tex files by name.`,
    );

    const title = (opts.title ?? (await promptTopic(asking, manifest?.topic))).trim();
    if (!title) throw new ImportError('the pack title is empty');

    let pair;
    try {
      pair = resolveTexPairFromDir(dir, title, manifest);
    } catch (e) {
      throw new ImportError(e.message);
    }
    if (!pair.qbtPath || !pair.solnPath) {
      throw new ImportError(`could not find both questions and solutions .tex files in ${dir}`);
    }

    // --- Where it goes ---------------------------------------------------
    const strands = loadStrands();
    const entries = loadResourcesEntries();
    let sitePath;
    if (opts['site-path'] !== undefined) {
      const parsed = parseSitePathArg(opts['site-path']);
      if (!parsed.ok) throw new ImportError(parsed.message);
      sitePath = `${parsed.strandFolder}/${parsed.sectionFolder}`;
    } else {
      console.log(`\n${listTreeShallow(fmRoot, 2)}`);
      sitePath = await pickSitePath(asking, fmRoot);
    }
    const [strandFolder, sectionFolder] = sitePath.split('/');
    const strand = strands.find((s) => s.folder === strandFolder);
    if (!strand) {
      throw new ImportError(
        `"${strandFolder}" is not a strand folder (strands: ${strands.map((s) => s.folder).join(', ')})`,
      );
    }
    const sectionDir = join(fmRoot, strandFolder, sectionFolder);
    if (!existsSync(sectionDir) || !statSync(sectionDir).isDirectory()) {
      throw new ImportError(
        `there is no section folder ${strandFolder}/${sectionFolder}: import only into an existing section ` +
          'folder (adding a section is a separate site change)',
      );
    }

    const fullSitePath = `further-maths/${sitePath}`;
    const ctx = derivePathContext(fullSitePath, entries);
    const packRows = entries.filter(
      (e) => e.file.startsWith(`/tex/${fullSitePath}/`) && (e.type === 'questions' || e.type === 'solutions'),
    );
    let section = resolveSection({ strand, folder: sitePath, packRows, sectionArg: opts.section });
    if (!section.ok && section.needsSection && !yes) {
      console.log(`\n${sitePath} holds no pack yet. ${strand.title} sections:`);
      for (const t of strand.topics) console.log(`  ${t.topic}`);
      for (;;) {
        const next = resolveSection({ strand, folder: sitePath, packRows, sectionArg: await ask('Section: ') });
        if (next.ok) {
          section = next;
          break;
        }
        console.error(`  ${next.message}`);
      }
    }
    if (!section.ok) throw new ImportError(section.message);
    const topic = section.topic;
    const sectionTitle = strand.topics.find((t) => t.topic === topic).title;
    if (/['\\]/.test(topic)) throw new ImportError(`the section "${topic}" holds a quote or backslash the catalogue can't hold`);

    // --- Boards and id ---------------------------------------------------
    if (!strand.boards) throw new ImportError(`could not read the ${strand.title} board list`);
    let boards;
    if (opts.boards !== undefined) {
      const parsed = parseBoardsFlag(opts.boards, strand.boards);
      if (!parsed.ok) throw new ImportError(parsed.message);
      boards = parsed.boardIds;
    } else {
      const used = [...new Set(packRows.flatMap((e) => e.boards ?? []))];
      boards = await promptExamBoards(asking, strand.boards, used);
    }

    let id = opts.id?.trim();
    if (!id) {
      const proposed = deriveTopicId(ctx.idPrefix, title);
      id = (await ask(`\nResource id for the questions row (default ${proposed}): `)).trim() || proposed;
    }
    const idProblem = resourceIdProblem(id);
    if (idProblem) throw new ImportError(idProblem);
    for (const taken of [id, solutionsId(id)]) {
      const row = entries.find((e) => e.id === taken);
      if (row) throw new ImportError(`the id '${taken}' is already in resources.ts (${row.file})`);
    }

    // --- The documents ----------------------------------------------------
    const sanitized = sanitizeTopic(title);
    const qbtDir = join(sectionDir, 'qbt');
    const solnDir = join(sectionDir, 'soln');
    const qbtTexDest = join(qbtDir, `_QBT__${sanitized}.tex`);
    const solnTexDest = join(solnDir, `_QBT___Solns__${sanitized}.tex`);
    for (const dest of [qbtTexDest, solnTexDest]) {
      if (existsSync(dest)) {
        throw new ImportError(`${repoRel(dest)} already exists: this pack is on the site, so edit it there`);
      }
    }

    const qbtRaw = readFileSync(pair.qbtPath, 'utf8');
    const solnRaw = readFileSync(pair.solnPath, 'utf8');
    const docs = [
      { name: basename(pair.qbtPath), text: qbtRaw },
      { name: basename(pair.solnPath), text: solnRaw },
    ];
    const withImages = docs.filter((d) => usesIncludeGraphics(d.text)).map((d) => d.name);
    if (withImages.length > 0) {
      throw new ImportError(`${withImages.join(' and ')} use \\includegraphics: packs are TikZ-only`);
    }
    const mechanicsProblem = mechanicsPackProblem(docs, isFurtherMechanicsPackPath(repoRel(qbtTexDest)));
    if (mechanicsProblem) throw new ImportError(mechanicsProblem);

    const identity = importedPackIdentity(fullSitePath, title, { category: strand.category, topic }, strands);
    for (const [raw, dest] of [[qbtRaw, qbtTexDest], [solnRaw, solnTexDest]]) {
      try {
        prepareImportedTex(raw, repoRel(dest), identity);
      } catch (e) {
        throw new ImportError(`${basename(dest)}: ${e.message}`);
      }
    }

    const qbtFile = `/tex/${fullSitePath}/qbt/_QBT__${sanitized}.pdf`;
    const solnFile = `/tex/${fullSitePath}/soln/_QBT___Solns__${sanitized}.pdf`;
    const pack = { id, title, category: strand.category, topic, qbtFile, solnFile, boards };

    console.log('\nImport:');
    console.log(`  title:    ${title}`);
    console.log(`  section:  ${strand.title} / ${sectionTitle} (${sitePath})`);
    console.log(`  boards:   ${boards ? boards.join(', ') : 'all'}`);
    console.log(`  ids:      ${id}, ${solutionsId(id)}`);
    console.log(`  files:    ${repoRel(qbtTexDest)}`);
    console.log(`            ${repoRel(solnTexDest)}`);
    console.log(`  rows go:  ${ctx.siblingId ? `after ${ctx.siblingId}` : `at the end of the ${strand.title} rows, as the section's first pack`}`);
    if (!yes) {
      const confirm = await ask('OK? (Y/n): ');
      if (confirm.trim().toLowerCase() === 'n') {
        console.log('Aborted.');
        return;
      }
    }

    await place({
      ask,
      yes,
      pair,
      identity,
      qbtTexDest,
      solnTexDest,
      pack,
      insertion: ctx.siblingId
        ? { afterId: ctx.siblingId }
        : { sectionComment: `A-level Further Maths: ${strand.title} - ${sectionTitle}` },
    });
  } finally {
    rl?.close();
  }
}

/**
 * Write the documents, PDFs, rows and generated files. On any failure, put
 * back everything written.
 */
async function place({ ask, yes, pair, identity, qbtTexDest, solnTexDest, pack, insertion }) {
  const createdDirs = [];
  const createdFiles = [];
  const resourcesBefore = readFileSync(resourcesPath, 'utf8');
  let resourcesWritten = false;
  const generators = ['count-questions.mjs', 'hash-assets.mjs'];
  const regenerate = () => {
    for (const script of generators) {
      execFileSync(process.execPath, [join(__dirname, script)], { cwd: repoRoot, stdio: 'pipe' });
    }
  };

  try {
    for (const d of [dirname(qbtTexDest), dirname(solnTexDest)]) {
      if (!existsSync(d)) {
        mkdirSync(d, { recursive: true });
        createdDirs.push(d);
      }
    }
    for (const [src, dest] of [[pair.qbtPath, qbtTexDest], [pair.solnPath, solnTexDest]]) {
      createdFiles.push(dest);
      copyNormalizedPackTex(src, dest, identity);
    }

    for (const tex of [qbtTexDest, solnTexDest]) {
      process.stdout.write(`Compiling ${basename(tex, '.tex')}... `);
      const result = compileTex(tex);
      if (result.ok) {
        const pdfDest = tex.replace(/\.tex$/, '.pdf');
        createdFiles.push(pdfDest);
        copyFileSync(result.pdf, pdfDest);
        console.log('done');
        continue;
      }
      console.log('FAILED');
      console.error(result.log);
      if (yes) throw new ImportError(`${basename(tex)} did not compile`);
      const cont = await ask('  Compilation failed. Continue without this PDF? (y/N): ');
      if (cont.trim().toLowerCase() !== 'y') throw new ImportError(`${basename(tex)} did not compile`);
    }

    const updated = insertPackRows(resourcesBefore, pack, insertion);
    const problems = verifyPackRows(updated, pack);
    if (problems.length > 0) {
      throw new ImportError(`the new rows did not read back from resources.ts:\n  ${problems.join('\n  ')}`);
    }
    writeAtomic(resourcesPath, updated);
    resourcesWritten = true;

    process.stdout.write('Regenerating question counts and file hashes... ');
    regenerate();
    console.log('done');
  } catch (e) {
    console.error('\nPutting back what the import wrote.');
    if (resourcesWritten) writeAtomic(resourcesPath, resourcesBefore);
    for (const f of createdFiles) rmSync(f, { force: true });
    for (const d of createdDirs) rmSync(d, { recursive: true, force: true });
    if (resourcesWritten) {
      try {
        regenerate();
      } catch {
        console.error('Could not regenerate the generated files: run `npm run build`.');
      }
    }
    throw e;
  }

  console.log('\nImported:');
  for (const f of [qbtTexDest, qbtTexDest.replace(/\.tex$/, '.pdf'), solnTexDest, solnTexDest.replace(/\.tex$/, '.pdf')]) {
    if (existsSync(f)) console.log(`  ${repoRel(f)}`);
  }
  console.log(`  src/data/resources.ts: ${pack.id}, ${solutionsId(pack.id)}`);
  console.log('  src/data/*.generated.ts regenerated');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`import-pack: ${e instanceof ImportError ? e.message : e.stack ?? e}`);
    process.exit(1);
  });
}
