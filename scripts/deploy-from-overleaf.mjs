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

loadEnv(join(repoRoot, '.env'));

const TOKEN = process.env.OVERLEAF_GIT_TOKEN;
if (!TOKEN) {
  console.error('Error: OVERLEAF_GIT_TOKEN not found in .env or environment.');
  exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace every non-alphanumeric character with an underscore. */
function sanitizeTopic(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

/** Extract an Overleaf project ID from a full URL or bare ID. */
function parseProjectId(input) {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/overleaf\.com\/project\/([a-f0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-f0-9]+$/i.test(trimmed)) return trimmed;
  return null;
}

/** Clone an Overleaf project into a temp directory, return the path. */
function cloneProject(projectId, label) {
  const dir = join(tmpdir(), `overleaf-${label}-${randomBytes(4).toString('hex')}`);
  const url = `https://git:${TOKEN}@git.overleaf.com/${projectId}`;
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
  const rl = createInterface({ input: stdin, output: stdout });
  const tempDirs = [];

  try {
    console.log('\n=== Deploy from Overleaf ===\n');

    const topicName = await rl.question('Topic name (e.g. "Matrix Determinants & Inverses"): ');
    const sitePath = await rl.question('Site path (e.g. "further-maths/vectors"): ');

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
    const qbtDir = cloneProject(qbtId, 'qbt');
    tempDirs.push(qbtDir);
    console.log('done');

    process.stdout.write('Cloning solutions project... ');
    const solnDir = cloneProject(solnId, 'soln');
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
    console.log();
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

main();
