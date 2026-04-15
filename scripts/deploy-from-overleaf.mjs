/**
 * Pull .tex from Overleaf via git, compile PDFs with the same latexmk
 * invocation as LaTeX Workshop, place files, and run clean-tex.
 */

import { readFileSync, mkdirSync, readdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, exit } from 'node:process';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

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

/** @param {string[] | null} boardIds */
export function formatBoardsSnippet(boardIds) {
  if (!boardIds || boardIds.length === 0) {
    return '  (omit `boards` — applies to all exam boards)';
  }
  return `  boards: [${boardIds.map((id) => `'${id}'`).join(', ')}],`;
}

/** Extract an Overleaf project ID from a full URL or bare ID. */
export function parseProjectId(input) {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/overleaf\.com\/project\/([a-f0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-f0-9]+$/i.test(trimmed)) return trimmed;
  return null;
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
 * Find the main .tex file in a cloned Overleaf project.
 * Priority: main.tex at root, then any .tex containing \\begin{document}.
 */
function findMainTex(dir) {
  const mainTex = join(dir, 'main.tex');
  if (existsSync(mainTex)) return mainTex;

  const texFiles = readdirSync(dir).filter((f) => f.endsWith('.tex'));
  for (const f of texFiles) {
    const content = readFileSync(join(dir, f), 'utf8');
    if (content.includes('\\begin{document}')) return join(dir, f);
  }
  return null;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const token = requireToken();
  const rl = createInterface({ input: stdin, output: stdout });
  const tempDirs = [];

  try {
    console.log('\n=== Deploy from Overleaf ===\n');

    const topicName = await rl.question('Topic name (e.g. "Matrix Determinants & Inverses"): ');
    const sitePath = await rl.question('Site path (e.g. "further-maths/core-pure/vectors"): ');
    const examBoardIds = await promptExamBoards(rl);

    const qbtInput = await rl.question('\nQuestions Overleaf URL or project ID: ');
    const solnInput = await rl.question('Solutions Overleaf URL or project ID: ');

    const qbtId = parseProjectId(qbtInput);
    const solnId = parseProjectId(solnInput);

    if (!qbtId) {
      console.error(`Could not parse project ID from: ${qbtInput}`);
      exit(1);
    }
    if (!solnId) {
      console.error(`Could not parse project ID from: ${solnInput}`);
      exit(1);
    }

    const sanitized = sanitizeTopic(topicName);
    const qbtFileName = `_QBT__${sanitized}`;
    const solnFileName = `_QBT___Solns__${sanitized}`;

    console.log('\nDerived filenames:');
    console.log(`  QBT:  ${qbtFileName}`);
    console.log(`  Soln: ${solnFileName}`);

    const confirm = await rl.question('OK? (Y/n): ');
    if (confirm.trim().toLowerCase() === 'n') {
      console.log('Aborted.');
      exit(0);
    }

    // -- Clone --
    process.stdout.write('\nCloning questions project... ');
    const qbtDir = cloneProject(qbtId, 'qbt', token);
    tempDirs.push(qbtDir);
    console.log('done');

    process.stdout.write('Cloning solutions project... ');
    const solnDir = cloneProject(solnId, 'soln', token);
    tempDirs.push(solnDir);
    console.log('done');

    // -- Find main .tex files --
    const qbtTex = findMainTex(qbtDir);
    if (!qbtTex) {
      console.error('Could not find a main .tex file in the questions project.');
      exit(1);
    }
    const solnTex = findMainTex(solnDir);
    if (!solnTex) {
      console.error('Could not find a main .tex file in the solutions project.');
      exit(1);
    }

    // -- Destination directories --
    const qbtDest = join(texRoot, sitePath, 'qbt');
    const solnDest = join(texRoot, sitePath, 'soln');
    mkdirSync(qbtDest, { recursive: true });
    mkdirSync(solnDest, { recursive: true });

    // -- Copy .tex to destinations --
    const qbtTexDest = join(qbtDest, `${qbtFileName}.tex`);
    const solnTexDest = join(solnDest, `${solnFileName}.tex`);
    copyFileSync(qbtTex, qbtTexDest);
    copyFileSync(solnTex, solnTexDest);

    // -- Compile --
    const deployed = [qbtTexDest, solnTexDest];

    process.stdout.write('Compiling questions PDF... ');
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

    // -- Clean tex --
    process.stdout.write('Running clean-tex... ');
    execSync('node scripts/clean-tex.mjs', { cwd: repoRoot, stdio: 'pipe' });
    console.log('done');

    // -- Summary --
    console.log('\nFiles deployed:');
    for (const f of deployed) {
      const rel = f.slice(repoRoot.length + 1).replace(/\\/g, '/');
      console.log(`  ${rel}`);
    }
    console.log('\n--- Add to src/data/resources.ts (questions + solutions pair) ---');
    console.log('Set `pairId` / ids to match your naming. On the **questions** resource only:');
    console.log(formatBoardsSnippet(examBoardIds));
    console.log(`  file: '/tex/${sitePath.replace(/\\/g, '/')}/qbt/${qbtFileName}.pdf',`);
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
