/**
 * Pull .tex from Overleaf via git, compile PDFs with the same latexmk
 * invocation as LaTeX Workshop, place files, run clean-tex, and stage a
 * `data/resources-pending.json` entry for downstream splicing into `resources.ts`.
 */

import {
  readFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, exit } from 'node:process';
import { randomBytes } from 'node:crypto';

import { listTreeShallow, pickSitePath } from './lib/site-tree.mjs';
import {
  derivePathContext,
  deriveTopicId,
  loadResourcesEntries,
  slugify,
} from './lib/resources-derive.mjs';
import { addPendingEntry, readPending } from './lib/staging.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');
const pendingPath = join(repoRoot, 'data', 'resources-pending.json');

export const SKIP_TEX_FILES = new Set(['draft.tex', 'original.tex']);

// ---------------------------------------------------------------------------
// Inline .env loader (avoids adding dotenv as a dependency)
// ---------------------------------------------------------------------------
function loadEnv(filePath) {
  try {
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] ??= m[2];
    }
  } catch {
    // .env missing is fine — token may already be in the environment
  }
}

function requireToken() {
  loadEnv(join(repoRoot, '.env'));
  const token = process.env.OVERLEAF_GIT_TOKEN;
  if (!token) {
    console.error('Error: OVERLEAF_GIT_TOKEN not found in .env or environment.');
    exit(1);
  }
  return token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace every non-alphanumeric character with an underscore. */
export function sanitizeTopic(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

/** Matches `ExamBoard` in `src/data/resources.ts` (order aligns with numbered menu 2–6). */
const EXAM_BOARD_IDS = ['edexcel', 'aqa', 'ocr-a', 'ocr-mei', 'cie'];

/**
 * Prompt for exam boards (numbered multi-select). Returns `null` = all boards.
 * @param {import('node:readline/promises').Interface} rl
 */
export async function promptExamBoards(rl) {
  console.log('\nExam boards:');
  console.log('  1. All boards (default)');
  console.log('  2. Edexcel');
  console.log('  3. AQA');
  console.log('  4. OCR A');
  console.log('  5. OCR MEI');
  console.log('  6. CIE');

  for (;;) {
    const line = await rl.question('Select boards (comma-separated numbers, Enter for all): ');
    const result = parseBoardSelection(line);
    if (result.ok) return result.boardIds;
    console.error(`  ${result.message}`);
  }
}

/**
 * @param {string} line
 * @returns {{ ok: true, boardIds: string[] | null } | { ok: false, message: string }}
 */
export function parseBoardSelection(line) {
  const t = line.trim();
  if (!t) return { ok: true, boardIds: null };

  const parts = t.split(/[\s,]+/).filter(Boolean);
  const nums = parts.map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n));

  if (nums.length === 0) {
    return { ok: false, message: 'Enter numbers 1–6, or leave blank for all boards.' };
  }
  if (nums.some((n) => n < 1 || n > 6)) {
    return { ok: false, message: 'Each number must be between 1 and 6.' };
  }

  if (nums.includes(1)) {
    if (nums.length > 1) {
      return { ok: false, message: 'Option 1 (All boards) cannot be combined with other numbers.' };
    }
    return { ok: true, boardIds: null };
  }

  const unique = [...new Set(nums)].sort((a, b) => a - b);
  const boardIds = unique.map((n) => EXAM_BOARD_IDS[n - 2]).filter(Boolean);
  if (boardIds.length === 0) {
    return { ok: false, message: 'Pick one or more of 2–6, or 1 for all boards.' };
  }
  return { ok: true, boardIds: [...new Set(boardIds)] };
}

/** Extract an Overleaf project ID from a full URL or bare ID. */
export function parseProjectId(input) {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/overleaf\.com\/project\/([a-f0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-f0-9]+$/i.test(trimmed)) return trimmed;
  return null;
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
 * Tiered discovery of the main pack `.tex` in a cloned Overleaf project root.
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
 * Like `findPackTex`, but returns `null` when that kind is missing (second clone may supply it).
 * Still throws on ambiguous matches or when the project has no `\\begin{document}` .tex at all.
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
 * Resolve qbt + soln paths from one clone; split same-path tier-3 results by filename.
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

/** Clone an Overleaf project into a temp directory, return the path. */
function cloneProject(projectId, label, token) {
  const dir = join(tmpdir(), `overleaf-${label}-${randomBytes(4).toString('hex')}`);
  const url = `https://git:${token}@git.overleaf.com/${projectId}`;
  try {
    execSync(`git clone --depth 1 ${url} "${dir}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`\nFailed to clone ${label} project ${projectId}.`);
    console.error('Check that the project ID and OVERLEAF_GIT_TOKEN are correct.');
    console.error(e.stderr?.toString() ?? e.message);
    exit(1);
  }
  return dir;
}

/**
 * Compile a .tex file using the exact latexmk flags from .vscode/settings.json.
 * Returns the path to the resulting PDF.
 */
function compileTex(texFilePath) {
  const texDir = dirname(texFilePath);
  const texName = basename(texFilePath);
  const outDir = join(texDir, 'build');
  const auxDir = join(outDir, 'aux');

  const cmd = [
    'latexmk',
    '-pdf',
    '-cd',
    '-interaction=nonstopmode',
    '-synctex=1',
    '-file-line-error',
    `-auxdir="${auxDir}"`,
    `-outdir="${outDir}"`,
    `"${texName}"`,
  ].join(' ');

  execSync(cmd, { cwd: texDir, stdio: 'inherit' });

  const pdfName = texName.replace(/\.tex$/, '.pdf');
  return join(outDir, pdfName);
}

/**
 * @param {{ id: string; topicName: string; siblingId: string | null }} p
 */
export function formatPairPreview(p) {
  const sid = p.siblingId ? `'${p.siblingId}'` : 'undefined';
  return [
    `  { id: '${p.id}', title: '${p.topicName.replace(/'/g, "\\'")}', /* questions row — set description, file, pairId, topic, … */`,
    `  { id: '${p.id}-solns', title: '${p.topicName.replace(/'/g, "\\'")}', /* solutions row — pairId → questions id */`,
    `  // insert after sibling id: ${sid}`,
  ].join('\n');
}

// Re-export for tests / tooling
export { derivePathContext, deriveTopicId, slugify, addPendingEntry };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const token = requireToken();
  const rl = createInterface({ input: stdin, output: stdout });
  const tempDirs = [];

  try {
    console.log('\n=== Deploy from Overleaf ===\n');
    console.log('public/tex/ (depth ≤ 3):\n');
    console.log(listTreeShallow(texRoot, 3));
    console.log('');

    const sitePath = await pickSitePath(rl, texRoot);
    const topicName = await rl.question('\nTopic name (e.g. "Matrix Determinants & Inverses"): ');
    const examBoardIds = await promptExamBoards(rl);

    const url1 = await rl.question('\nOverleaf URL or project ID (unified project, or first of two legacy projects): ');
    const firstId = parseProjectId(url1);
    if (!firstId) {
      console.error(`Could not parse project ID from: ${url1}`);
      exit(1);
    }

    process.stdout.write('\nCloning first project... ');
    const dir1 = cloneProject(firstId, 'p1', token);
    tempDirs.push(dir1);
    console.log('done');

    let qbtPath;
    let solnPath;
    let qbtProjectId;
    let solnProjectId;

    try {
      const r1 = resolveTexPairFromClone(dir1, topicName);
      qbtPath = r1.qbtPath;
      solnPath = r1.solnPath;
      if (qbtPath) qbtProjectId = firstId;
      if (solnPath) solnProjectId = firstId;
    } catch (e) {
      console.error(e.message ?? e);
      exit(1);
    }

    if (!qbtPath || !solnPath) {
      const hint =
        qbtPath && !solnPath
          ? 'questions'
          : !qbtPath && solnPath
            ? 'solutions'
            : 'one pack';
      const line = await rl.question(
        `\nOnly found ${hint} in the first project (or one .tex could not be classified). Paste second Overleaf URL or ID (Enter to abort): `,
      );
      if (!line.trim()) {
        console.log('Aborted.');
        exit(0);
      }
      const secondId = parseProjectId(line);
      if (!secondId) {
        console.error(`Could not parse project ID from: ${line}`);
        exit(1);
      }
      process.stdout.write('Cloning second project... ');
      const dir2 = cloneProject(secondId, 'p2', token);
      tempDirs.push(dir2);
      console.log('done');

      try {
        const r2 = resolveTexPairFromClone(dir2, topicName);
        if (!qbtPath && r2.qbtPath) {
          qbtPath = r2.qbtPath;
          qbtProjectId = secondId;
        }
        if (!solnPath && r2.solnPath) {
          solnPath = r2.solnPath;
          solnProjectId = secondId;
        }
      } catch (e) {
        console.error(e.message ?? e);
        exit(1);
      }
    }

    if (!qbtPath || !solnPath) {
      console.error('Could not resolve both questions and solutions .tex files after clone(s).');
      exit(1);
    }

    const unifiedSingleProject = qbtProjectId !== undefined && qbtProjectId === solnProjectId;

    const sanitized = sanitizeTopic(topicName);
    const qbtFileName = `_QBT__${sanitized}`;
    const solnFileName = `_QBT___Solns__${sanitized}`;

    console.log('\nDerived filenames:');
    console.log(`  QBT:  ${qbtFileName}`);
    console.log(`  Soln: ${solnFileName}`);

    const allEntries = loadResourcesEntries();
    let ctx = derivePathContext(sitePath, allEntries);
    if (ctx.category === 'unknown') {
      const c = await rl.question(
        '\nCategory string as in resources.ts (e.g. "FM - Core Pure", "FM - Further Mechanics", "TMUA"): ',
      );
      ctx = { ...ctx, category: c.trim() || ctx.category };
    }

    let id = deriveTopicId(ctx.idPrefix, topicName);
    const idAns = await rl.question(`\nResource id for questions row (default ${id}): `);
    if (idAns.trim()) id = idAns.trim();

    const confirm = await rl.question('OK? (Y/n): ');
    if (confirm.trim().toLowerCase() === 'n') {
      console.log('Aborted.');
      exit(0);
    }

    const qbtDest = join(texRoot, sitePath, 'qbt');
    const solnDest = join(texRoot, sitePath, 'soln');
    mkdirSync(qbtDest, { recursive: true });
    mkdirSync(solnDest, { recursive: true });

    const qbtTexDest = join(qbtDest, `${qbtFileName}.tex`);
    const solnTexDest = join(solnDest, `${solnFileName}.tex`);
    copyFileSync(qbtPath, qbtTexDest);
    copyFileSync(solnPath, solnTexDest);

    const deployed = [qbtTexDest, solnTexDest];

    process.stdout.write('\nCompiling questions PDF... ');
    try {
      const qbtPdf = compileTex(qbtTexDest);
      const qbtPdfDest = join(qbtDest, `${qbtFileName}.pdf`);
      copyFileSync(qbtPdf, qbtPdfDest);
      deployed.push(qbtPdfDest);
      console.log('done');
    } catch {
      console.log('FAILED');
      const cont = await rl.question('  Compilation failed. Continue without PDF? (y/N): ');
      if (cont.trim().toLowerCase() !== 'y') exit(1);
    }

    process.stdout.write('Compiling solutions PDF... ');
    try {
      const solnPdf = compileTex(solnTexDest);
      const solnPdfDest = join(solnDest, `${solnFileName}.pdf`);
      copyFileSync(solnPdf, solnPdfDest);
      deployed.push(solnPdfDest);
      console.log('done');
    } catch {
      console.log('FAILED');
      const cont = await rl.question('  Compilation failed. Continue without PDF? (y/N): ');
      if (cont.trim().toLowerCase() !== 'y') exit(1);
    }

    process.stdout.write('Running clean-tex... ');
    execSync('node scripts/clean-tex.mjs', { cwd: repoRoot, stdio: 'pipe' });
    console.log('done');

    const relSite = sitePath.replace(/\\/g, '/');
    const qbtPdfRel = `/tex/${relSite}/qbt/${qbtFileName}.pdf`;
    const solnPdfRel = `/tex/${relSite}/soln/${solnFileName}.pdf`;

    const stagingEntry = {
      addedAt: new Date().toISOString(),
      status: 'pending',
      sitePath: relSite,
      topicName,
      id,
      category: ctx.category,
      topic: ctx.topic,
      qbtFile: qbtPdfRel,
      solnFile: solnPdfRel,
      boards: examBoardIds,
      overleafProjectIds: {
        qbt: qbtProjectId,
        soln: unifiedSingleProject ? null : solnProjectId,
      },
      siblingId: ctx.siblingId,
      note: null,
      comments: '',
    };

    let stageOk = true;
    const prior = readPending(pendingPath);
    if (prior.entries.some((e) => e.id === id)) {
      const dupAns = await rl.question(`\nEntry id "${id}" is already pending — overwrite? (Y/n): `);
      stageOk = dupAns.trim().toLowerCase() !== 'n';
    }

    let stageResult = { ok: false, total: prior.entries.length };
    if (stageOk) {
      stageResult = addPendingEntry(pendingPath, stagingEntry, {
        confirmOverwrite: () => true,
      });
    } else {
      console.log('\nStaging skipped (existing entry kept).');
    }

    const totalPending = readPending(pendingPath).entries.length;

    console.log('\nFiles deployed:');
    for (const f of deployed) {
      const rel = f.slice(repoRoot.length + 1).replace(/\\/g, '/');
      console.log(`  ${rel}`);
    }

    console.log('\nStaged for resources.ts splice:');
    console.log(`  ${pendingPath.replace(/\\/g, '/')} (${totalPending} pending ${totalPending === 1 ? 'entry' : 'entries'} total)`);
    console.log(`  id: ${id}`);
    console.log(`  insert after: ${ctx.siblingId ?? '(no sibling — append in topic order)'}`);

    console.log('\n--- Preview (paste into src/data/resources.ts after siblingId\'s pair) ---');
    console.log(formatPairPreview({ id, topicName, siblingId: ctx.siblingId }));
    console.log('---\n');
  } finally {
    rl.close();
    for (const d of tempDirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
