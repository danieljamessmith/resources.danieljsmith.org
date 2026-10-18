/**
 * Import a Further Maths pack into the site from a local folder holding its
 * questions and solutions documents (named by `pack.json` when there is one).
 *
 * It places them under `public/tex/further-maths/<strand>/<section>/{qbt,soln}/`,
 * sets the header title and `\djsSitePath`, strips comments, compiles both
 * PDFs, writes the pack's two rows into `src/data/resources.ts` after the
 * section's last pack, and regenerates the generated data files. If any of
 * that fails, or the run is interrupted, everything it wrote is put back. A
 * run that is killed outright leaves a journal of what it wrote, and the next
 * run puts that back before it starts.
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
import { createHash, randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { stdin, stdout } from 'node:process';

import { processContent } from './clean-tex.mjs';
import { syncPair } from './lib/question-blocks.mjs';
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

/** The generated data files, under `src/data/`, that the import regenerates. */
export const GENERATED_FILES = ['questionCounts.generated.ts', 'fileHashes.generated.ts'];

/**
 * The paths the import reads and writes in a site checkout.
 * @param {string} root
 */
export function sitePaths(root) {
  return {
    root,
    fmRoot: join(root, 'public', 'tex', 'further-maths'),
    resources: join(root, 'src', 'data', 'resources.ts'),
    topics: join(root, 'src', 'data', 'topics.ts'),
    generated: GENERATED_FILES.map((name) => join(root, 'src', 'data', name)),
  };
}

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
      throw new Error(`${basename(path)} is listed in ${PACK_MANIFEST} but missing from the pack folder ${basename(dir)}`);
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
    throw new Error(`No .tex with \\\\begin{document} in ${basename(dir)}`);
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
 * the editor uses, plus `-f` as `compile-tex` passes it: without it, a run
 * that was killed or failed for a reason outside the `.tex` leaves latexmk
 * refusing every retry without showing an error. Returns the PDF's path, or
 * what went wrong.
 * @param {string} texFilePath
 * @returns {{ ok: true, pdf: string } | { ok: false, log: string }}
 */
export function compileTex(texFilePath) {
  const texDir = dirname(texFilePath);
  const texName = basename(texFilePath);
  const outDir = join(texDir, 'build');
  const result = spawnSync(
    'latexmk',
    [
      '-pdf',
      '-cd',
      '-f',
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

/** Regenerate the generated data files, as the `pre*` npm hooks do. */
function runGenerators(root) {
  for (const script of ['count-questions.mjs', 'hash-assets.mjs']) {
    execFileSync(process.execPath, [join(__dirname, script)], { cwd: root, stdio: 'pipe' });
  }
}

/** `path` relative to `root`, with forward slashes. */
function relTo(root, path) {
  return path.slice(root.length + 1).replace(/\\/g, '/');
}

/** Write through a temporary file, so a reader never sees half a file. */
function writeAtomic(path, text) {
  const tmp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, path);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Reported through the original error.
    }
    throw e;
  }
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** What to print for an error: the message of an expected one, else its stack. */
function describeError(e) {
  return e instanceof ImportError ? e.message : (e?.stack ?? String(e));
}

/**
 * A pack document as it is placed on the site: in the shared-preamble
 * wrapper, with its header title and site path set (`identity`), dated if it
 * was undated, and with no full-line comment left except the question
 * delimiters and source hints, before `\begin{document}` or after
 * `\end{document}` included. Preamble comments go here; the rest is cleaned
 * as clean-tex cleans it.
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
 * Both documents as they are placed on the site (`prepareImportedTex`), with
 * the solutions document's statements then taken from the questions
 * document, as `sync-questions` does. Stripping comments can leave the two
 * documents' blank lines around a statement differing (a statement followed
 * by a commented diagram description does), which `check-questions` would
 * report as drift. Throws when the documents' questions don't line up.
 *
 * @param {{ qbt: string; soln: string }} raw
 * @param {{
 *   qbtRel: string;
 *   solnRel: string;
 *   identity?: { title?: string; strand?: string; section?: string };
 *   initialDate?: string;
 * }} where - `qbtRel` and `solnRel` as for `prepareImportedTex`
 * @returns {{ qbt: string; soln: string; synced: number[] }} `synced` numbers
 *   the questions whose solutions-document statement was rewritten
 */
export function preparePackPair(raw, { qbtRel, solnRel, identity, initialDate = formatPackDate() }) {
  const prepare = (text, rel) => {
    try {
      return prepareImportedTex(text, rel, identity, initialDate);
    } catch (e) {
      throw new Error(`${basename(rel)}: ${e.message}`);
    }
  };
  const qbt = prepare(raw.qbt, qbtRel);
  const soln = prepare(raw.soln, solnRel);
  const sync = syncPair(qbt, soln);
  if (sync.fatal) {
    const issues = sync.issues.map(
      (i) => `${i.kind}${i.n != null ? ` Q${i.n}` : ''}${i.detail ? ` (${i.detail})` : ''}`,
    );
    throw new Error(`the questions and solutions documents don't hold the same questions: ${issues.join('; ')}`);
  }
  return { qbt, soln: sync.newSolnText, synced: sync.changes.map((c) => c.n) };
}

/** Warn when a document inputs a bundled `preamble.tex` that isn't beside it. */
function warnMissingBundledPreamble(srcPath, raw) {
  if (usesOverleafPackInput(raw) && !existsSync(join(dirname(srcPath), 'preamble.tex'))) {
    console.warn(
      `Warning: ${basename(srcPath)} imports preamble.tex, but no bundled preamble.tex was found beside it; using the site shared pack preamble.`,
    );
  }
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
  warnMissingBundledPreamble(srcPath, raw);
  writeFileSync(destPath, prepareImportedTex(raw, relTo(repoRoot, destPath), identity), 'utf8');
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

/**
 * Why `<strand folder>/<section folder>` is not a section folder under
 * `fmRoot`, spelled exactly as on disk, or null. Windows finds a folder
 * whatever its case, but the live site's paths are case-sensitive.
 *
 * @param {string} fmRoot - `public/tex/further-maths`
 * @param {string} strandFolder
 * @param {string} sectionFolder
 * @returns {string | null}
 */
export function sectionFolderProblem(fmRoot, strandFolder, sectionFolder) {
  const folders = (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return [];
    }
  };
  const sameName = (names, name) =>
    names.find((n) => n === name) ?? names.find((n) => n.toLowerCase() === name.toLowerCase());
  const strand = sameName(folders(fmRoot), strandFolder);
  const section = strand ? sameName(folders(join(fmRoot, strand)), sectionFolder) : undefined;
  if (strand === strandFolder && section === sectionFolder) return null;
  if (section) {
    return (
      `there is no section folder ${strandFolder}/${sectionFolder}, but there is ${strand}/${section}: ` +
      "give it as it is spelt, since the site's paths are case-sensitive"
    );
  }
  return (
    `there is no section folder ${strandFolder}/${sectionFolder}: import only into an existing section folder. ` +
    '(Adding a section is a separate site change. Git keeps no empty folder, so the folder for a section ' +
    `with no pack yet is made by hand: public/tex/further-maths/${strandFolder}/<section folder>/.)`
  );
}

// Re-export for tests / tooling
export { derivePathContext, deriveTopicId, slugify, copyNormalizedPackTex };

// ---------------------------------------------------------------------------
// The journal: what an import has written, so a killed run can be put back
// ---------------------------------------------------------------------------

/**
 * What an import has written, as paths relative to the checkout. Each path is
 * recorded before it is written.
 *
 * @typedef {Object} ImportJournal
 * @property {string[]} files - files it created (the documents and PDFs)
 * @property {string[]} dirs - folders it created
 * @property {string[]} builds - the documents whose `build/` outputs to remove
 * @property {{ path: string; before: string; wrote: string | null }} resources
 *   - `resources.ts`, its text before the import, and the hash of the text the
 *     import wrote (null until it writes it)
 * @property {boolean} regenerating - whether the generators have started
 */

/**
 * The environment for a git command about the checkout at `cwd`: without the
 * variables that point git at another repository. Git sets them for a hook
 * (`GIT_DIR` is absolute in a linked worktree), so without this a run from a
 * hook would read the hook's repository instead of `cwd`'s.
 */
function gitEnv() {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']) {
    delete env[name];
  }
  return env;
}

/**
 * Where an import keeps its journal: in the checkout's git folder, so it is
 * never committed. Null outside a git checkout, where there is none.
 * @param {string} root
 */
function defaultJournalPath(root) {
  try {
    const rel = execFileSync('git', ['rev-parse', '--git-path', 'import-pack-journal.json'], {
      cwd: root,
      env: gitEnv(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return rel ? resolve(root, rel) : null;
  } catch {
    return null;
  }
}

/** Remove a document's outputs from its `build/` and `build/aux/` folders. */
function removeBuildOutputs(texPath) {
  const stem = basename(texPath, '.tex');
  const buildDir = join(dirname(texPath), 'build');
  for (const dir of [buildDir, join(buildDir, 'aux')]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${stem}.`)) rmSync(join(dir, name), { force: true });
    }
  }
}

/**
 * Put back what an import wrote, as its journal records it. Each step runs on
 * its own, so one failure doesn't stop the rest; returns what could not be
 * put back.
 *
 * @param {ImportJournal} journal
 * @param {{
 *   root: string;
 *   generatedBefore?: Map<string, Buffer | null>;
 *   regenerate: (root: string) => void;
 * }} how - with `generatedBefore` (the generated files' bytes before this
 *   run), `resources.ts` and the generated files get their earlier bytes
 *   back. Without it (an earlier run's journal), `resources.ts` is put back
 *   only if it still holds what that run wrote, and the generated files are
 *   regenerated.
 * @returns {string[]}
 */
function undoImport(journal, { root, generatedBefore, regenerate }) {
  const failures = [];
  const step = (what, undo) => {
    try {
      undo();
    } catch (e) {
      failures.push(`${what}: ${e.message ?? e}`);
    }
  };
  const abs = (rel) => join(root, ...rel.split('/'));

  for (const rel of journal.files) step(rel, () => rmSync(abs(rel), { force: true }));
  for (const rel of journal.builds) step(`${rel}'s build output`, () => removeBuildOutputs(abs(rel)));
  for (const rel of journal.dirs) step(rel, () => rmSync(abs(rel), { recursive: true, force: true }));

  const resources = journal.resources;
  if (resources.wrote) {
    step(resources.path, () => {
      const path = abs(resources.path);
      if (!generatedBefore) {
        const now = sha256(readFileSync(path, 'utf8'));
        if (now === sha256(resources.before)) return;
        if (now !== resources.wrote) throw new Error('it has changed since the import wrote it, so it was left alone');
      }
      writeAtomic(path, resources.before);
    });
  }
  if (journal.regenerating) {
    if (generatedBefore) {
      for (const [path, bytes] of generatedBefore) {
        step(relTo(root, path), () => (bytes === null ? rmSync(path, { force: true }) : writeAtomic(path, bytes)));
      }
    } else {
      step('the generated data files', () => regenerate(root));
    }
  }
  return failures;
}

/**
 * The paths among `rels` that git tracks in `root`, or none outside a git
 * checkout.
 * @param {string} root
 * @param {string[]} rels
 */
function trackedPaths(root, rels) {
  if (rels.length === 0) return [];
  try {
    return execFileSync('git', ['ls-files', '--', ...rels], { cwd: root, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * If an earlier import was killed part-way, put back what it wrote, as its
 * journal records, and remove the journal. Returns whether there was one.
 *
 * @param {{ root: string; journalPath: string | null; regenerate: (root: string) => void }} p
 * @returns {boolean}
 */
export function recoverInterruptedImport({ root, journalPath, regenerate }) {
  if (!journalPath || !existsSync(journalPath)) return false;
  const shown = journalPath.startsWith(root) ? relTo(root, journalPath) : basename(journalPath);
  /** @type {ImportJournal} */
  let journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  } catch (e) {
    throw new ImportError(`can't read ${shown}, which an earlier import left (${e.message}): delete it once that import's files are gone`);
  }
  const tracked = trackedPaths(root, [...journal.files, ...journal.dirs]);
  if (tracked.length > 0) {
    throw new ImportError(
      `${shown} records an earlier import that never finished, but git now tracks what it wrote ` +
        `(${tracked.join(', ')}). If that import was finished by hand, delete ${shown}.`,
    );
  }
  console.log('An earlier import stopped part-way. Putting back what it wrote.');
  const failures = undoImport(journal, { root, regenerate });
  if (failures.length > 0) {
    throw new ImportError(`could not put back all of the earlier import:\n  ${failures.join('\n  ')}`);
  }
  rmSync(journalPath, { force: true });
  return true;
}

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

/**
 * Run an import with the command line `argv`. The defaults are the real
 * checkout, compile, generators and journal; tests pass a scratch checkout and
 * stand-ins.
 *
 * @param {string[]} argv
 * @param {{
 *   root?: string;
 *   compile?: (texPath: string) => { ok: true, pdf: string } | { ok: false, log: string };
 *   regenerate?: (root: string) => void;
 *   journalPath?: string | null;
 *   signals?: import('node:events').EventEmitter;
 * }} [deps]
 */
export async function runImport(argv, deps = {}) {
  const root = deps.root ?? repoRoot;
  const paths = sitePaths(root);
  const compile = deps.compile ?? compileTex;
  const regenerate = deps.regenerate ?? runGenerators;
  const journalPath = deps.journalPath !== undefined ? deps.journalPath : defaultJournalPath(root);
  const signals = deps.signals ?? process;

  const opts = parseImportArgs(argv);
  const yes = opts.yes;
  if (yes) {
    const missing = missingForYes(opts);
    if (missing.length > 0) {
      throw new ImportError(`with --yes, give ${missing.map((k) => `--${k}`).join(', ')}`);
    }
  }
  recoverInterruptedImport({ root, journalPath, regenerate });
  const { rl, ask } = makeAsker(yes);
  const asking = { question: ask };

  try {
    // --- The pack folder, its documents and title -------------------------
    let folder = opts.folder !== undefined ? parseSource(opts.folder) : null;
    if (opts.folder !== undefined && !folder) throw new ImportError(`not a folder: ${basename(opts.folder)}`);
    while (!folder) {
      const answer = await ask('\nPack folder (the folder holding its two .tex files): ');
      folder = parseSource(answer);
      if (!folder) console.error('  Not an existing folder.');
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
        ? `Using ${PACK_MANIFEST} in ${basename(dir)}`
        : `No ${PACK_MANIFEST} in ${basename(dir)}; finding the two .tex files by name.`,
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
      throw new ImportError(`could not find both questions and solutions .tex files in ${basename(dir)}`);
    }

    // --- Where it goes ---------------------------------------------------
    const strands = loadStrands(paths.topics, paths.resources);
    const entries = loadResourcesEntries(paths.resources);
    let sitePath;
    if (opts['site-path'] !== undefined) {
      const parsed = parseSitePathArg(opts['site-path']);
      if (!parsed.ok) throw new ImportError(parsed.message);
      sitePath = `${parsed.strandFolder}/${parsed.sectionFolder}`;
    } else {
      console.log(`\n${listTreeShallow(paths.fmRoot, 2)}`);
      sitePath = await pickSitePath(asking, paths.fmRoot);
    }
    const [strandFolder, sectionFolder] = sitePath.split('/');
    const strand = strands.find((s) => s.folder === strandFolder);
    if (!strand) {
      throw new ImportError(
        `"${strandFolder}" is not a strand folder (strands: ${strands.map((s) => s.folder).join(', ')})`,
      );
    }
    const folderProblem = sectionFolderProblem(paths.fmRoot, strandFolder, sectionFolder);
    if (folderProblem) throw new ImportError(folderProblem);
    const sectionDir = join(paths.fmRoot, strandFolder, sectionFolder);

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
    const qbtTexDest = join(sectionDir, 'qbt', `_QBT__${sanitized}.tex`);
    const solnTexDest = join(sectionDir, 'soln', `_QBT___Solns__${sanitized}.tex`);
    for (const dest of [qbtTexDest, solnTexDest]) {
      if (existsSync(dest)) {
        throw new ImportError(`${relTo(root, dest)} already exists: this pack is on the site, so edit it there`);
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
    const mechanicsProblem = mechanicsPackProblem(docs, isFurtherMechanicsPackPath(relTo(root, qbtTexDest)));
    if (mechanicsProblem) throw new ImportError(mechanicsProblem);

    const identity = importedPackIdentity(fullSitePath, title, { category: strand.category, topic }, strands);
    let prepared;
    try {
      prepared = preparePackPair(
        { qbt: qbtRaw, soln: solnRaw },
        { qbtRel: relTo(root, qbtTexDest), solnRel: relTo(root, solnTexDest), identity },
      );
    } catch (e) {
      throw new ImportError(e.message);
    }
    warnMissingBundledPreamble(pair.qbtPath, qbtRaw);
    warnMissingBundledPreamble(pair.solnPath, solnRaw);

    const qbtFile = `/tex/${fullSitePath}/qbt/_QBT__${sanitized}.pdf`;
    const solnFile = `/tex/${fullSitePath}/soln/_QBT___Solns__${sanitized}.pdf`;
    const pack = { id, title, category: strand.category, topic, qbtFile, solnFile, boards };

    console.log('\nImport:');
    console.log(`  title:    ${title}`);
    console.log(`  section:  ${strand.title} / ${sectionTitle} (${sitePath})`);
    console.log(`  boards:   ${boards ? boards.join(', ') : 'all'}`);
    console.log(`  ids:      ${id}, ${solutionsId(id)}`);
    console.log(`  files:    ${relTo(root, qbtTexDest)}`);
    console.log(`            ${relTo(root, solnTexDest)}`);
    console.log(`  rows go:  ${ctx.siblingId ? `after ${ctx.siblingId}` : `at the end of the ${strand.title} rows, as the section's first pack`}`);
    if (prepared.synced.length > 0) {
      console.log(
        `  synced:   the solutions document takes Q${prepared.synced.join(', Q')}'s statement from the questions document`,
      );
    }
    if (!yes) {
      const confirm = await ask('OK? (Y/n): ');
      if (confirm.trim().toLowerCase() === 'n') {
        console.log('Aborted.');
        return;
      }
    }

    await place({
      paths,
      ask,
      yes,
      prepared,
      qbtTexDest,
      solnTexDest,
      pack,
      insertion: ctx.siblingId
        ? { afterId: ctx.siblingId }
        : { sectionComment: `A-level Further Maths: ${strand.title} - ${sectionTitle}` },
      compile,
      regenerate,
      journalPath,
      signals,
    });
  } finally {
    rl?.close();
  }
}

/**
 * Write the documents, PDFs, rows and generated files. On any failure, or a
 * SIGINT or SIGTERM, put back everything written. A journal records each
 * write before it happens, so a run killed outright is put back by the next.
 */
async function place({
  paths,
  ask,
  yes,
  prepared,
  qbtTexDest,
  solnTexDest,
  pack,
  insertion,
  compile,
  regenerate,
  journalPath,
  signals,
}) {
  const { root } = paths;
  const rel = (path) => relTo(root, path);
  const resourcesBefore = readFileSync(paths.resources, 'utf8');
  const generatedBefore = new Map(paths.generated.map((p) => [p, existsSync(p) ? readFileSync(p) : null]));
  /** @type {ImportJournal} */
  const journal = {
    files: [],
    dirs: [],
    builds: [rel(qbtTexDest), rel(solnTexDest)],
    resources: { path: rel(paths.resources), before: resourcesBefore, wrote: null },
    regenerating: false,
  };
  const record = () => {
    if (journalPath) writeAtomic(journalPath, `${JSON.stringify(journal)}\n`);
  };

  // The compile and the generators block the event loop, so a signal's
  // handler runs only once a step returns: check after each one.
  let stopped = null;
  const onInt = () => {
    stopped ??= 'SIGINT';
  };
  const onTerm = () => {
    stopped ??= 'SIGTERM';
  };
  signals.on('SIGINT', onInt);
  signals.on('SIGTERM', onTerm);
  const checkStopped = async () => {
    await new Promise((done) => setImmediate(done));
    if (stopped) throw new ImportError(`stopped by ${stopped}`);
  };

  try {
    try {
      record();
      for (const d of [dirname(qbtTexDest), dirname(solnTexDest)]) {
        if (!existsSync(d)) {
          journal.dirs.push(rel(d));
          record();
          mkdirSync(d, { recursive: true });
        }
      }
      for (const [text, dest] of [[prepared.qbt, qbtTexDest], [prepared.soln, solnTexDest]]) {
        journal.files.push(rel(dest));
        record();
        writeFileSync(dest, text, 'utf8');
      }
      await checkStopped();

      for (const tex of [qbtTexDest, solnTexDest]) {
        process.stdout.write(`Compiling ${basename(tex, '.tex')}... `);
        const result = compile(tex);
        await checkStopped();
        if (result.ok) {
          const pdfDest = tex.replace(/\.tex$/, '.pdf');
          journal.files.push(rel(pdfDest));
          record();
          copyFileSync(result.pdf, pdfDest);
          console.log('done');
          continue;
        }
        console.log('FAILED');
        console.error(result.log);
        if (yes) throw new ImportError(`${basename(tex)} did not compile`);
        const cont = await ask('  Compilation failed. Continue without this PDF? (y/N): ');
        await checkStopped();
        if (cont.trim().toLowerCase() !== 'y') throw new ImportError(`${basename(tex)} did not compile`);
      }

      const updated = insertPackRows(resourcesBefore, pack, insertion);
      const problems = verifyPackRows(updated, pack, resourcesBefore);
      if (problems.length > 0) {
        throw new ImportError(`the new rows did not read back from resources.ts:\n  ${problems.join('\n  ')}`);
      }
      journal.resources.wrote = sha256(updated);
      record();
      writeAtomic(paths.resources, updated);
      await checkStopped();

      process.stdout.write('Regenerating question counts and file hashes... ');
      journal.regenerating = true;
      record();
      regenerate(root);
      await checkStopped();
      console.log('done');
    } catch (e) {
      console.error(`\nimport-pack: ${describeError(e)}`);
      console.error('Putting back what the import wrote.');
      const failures = undoImport(journal, { root, generatedBefore, regenerate });
      if (failures.length > 0) {
        for (const failure of failures) console.error(`  could not put back ${failure}`);
        throw new ImportError(
          'the import failed, and what is listed above is still as the import left it' +
            (journalPath ? '; the next run puts it back once it can' : ''),
        );
      }
      if (journalPath) {
        try {
          rmSync(journalPath, { force: true });
        } catch {
          // The next run finds nothing of this one's left to put back.
        }
      }
      throw new ImportError('nothing was imported: everything the import wrote was put back');
    }
  } finally {
    signals.off('SIGINT', onInt);
    signals.off('SIGTERM', onTerm);
  }

  if (journalPath) {
    try {
      rmSync(journalPath, { force: true });
    } catch (e) {
      console.error(
        `Warning: could not remove ${rel(journalPath)} (${e.message}). Delete it before the next import, ` +
          'or that import will take this one out again.',
      );
    }
  }

  console.log('\nImported:');
  for (const f of [qbtTexDest, qbtTexDest.replace(/\.tex$/, '.pdf'), solnTexDest, solnTexDest.replace(/\.tex$/, '.pdf')]) {
    if (existsSync(f)) console.log(`  ${rel(f)}`);
  }
  console.log(`  src/data/resources.ts: ${pack.id}, ${solutionsId(pack.id)}`);
  console.log('  src/data/*.generated.ts regenerated');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runImport(process.argv.slice(2)).catch((e) => {
    console.error(`import-pack: ${describeError(e)}`);
    process.exit(1);
  });
}
