/**
 * Compiles QBT/soln .tex files under a given scope using latexmk.
 *
 * Usage:
 *   node scripts/compile-tex.mjs [scope] [--deploy]
 *
 *   scope    further-maths (default) | tmua | all
 *   --deploy  copy built PDFs to their sibling deployed location on success
 *
 * Latexmk args mirror .vscode/settings.json (latex-workshop.latex.tools).
 */

import { readdirSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

// --- Argument parsing -------------------------------------------------------

const args = process.argv.slice(2);
const deploy = args.includes('--deploy');
const positional = args.filter((a) => !a.startsWith('-'));
const scope = positional[0] ?? 'further-maths';

const searchRoot = scope === 'all' ? texRoot : join(texRoot, scope);

// --- File discovery ---------------------------------------------------------

function shouldCompile(absPath) {
  const p = absPath.replace(/\\/g, '/').toLowerCase();
  if (!p.endsWith('.tex')) return false;
  if (p.includes('/notes/')) return false;
  return p.includes('/qbt/') || p.includes('/soln/');
}

function walkTexFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTexFiles(full, acc);
    } else if (entry.isFile() && shouldCompile(full)) {
      acc.push(full);
    }
  }
  return acc;
}

// --- Build ------------------------------------------------------------------

function buildFile(absTexPath) {
  const texDir = dirname(absTexPath);
  const outDir = join(texDir, 'build');

  mkdirSync(join(outDir, 'aux'), { recursive: true });

  const result = spawnSync(
    'latexmk',
    [
      '-f',
      '-pdf',
      '-cd',
      '-interaction=nonstopmode',
      '-synctex=1',
      '-file-line-error',
      `-auxdir=${outDir}/aux`,
      `-outdir=${outDir}`,
      absTexPath,
    ],
    { stdio: 'inherit', encoding: 'utf8' },
  );

  return result.status ?? 1;
}

function deployPdf(absTexPath) {
  const texDir = dirname(absTexPath);
  const name = basename(absTexPath, '.tex');
  const buildPdf = join(texDir, 'build', `${name}.pdf`);
  const deployedPdf = join(texDir, `${name}.pdf`);
  copyFileSync(buildPdf, deployedPdf);
}

// --- Main -------------------------------------------------------------------

const files = walkTexFiles(searchRoot).sort();

if (files.length === 0) {
  console.error(`compile-tex: no .tex files found under ${searchRoot}`);
  process.exit(1);
}

console.log(`compile-tex: ${files.length} file(s) | scope=${scope}${deploy ? ' | --deploy' : ''}\n`);

let passed = 0;
let failed = 0;

for (const absTexPath of files) {
  const rel = absTexPath.slice(repoRoot.length + 1).replace(/\\/g, '/');
  console.log(`\n── ${rel}`);

  const exitCode = buildFile(absTexPath);

  if (exitCode === 0) {
    passed++;
    if (deploy) {
      try {
        deployPdf(absTexPath);
        console.log(`   ✓ deployed`);
      } catch (e) {
        console.error(`   deploy failed: ${e.message}`);
        failed++;
        passed--;
      }
    }
  } else {
    console.error(`   ✗ latexmk exited ${exitCode}`);
    failed++;
  }
}

console.log(`\ncompile-tex: ${passed} succeeded, ${failed} failed`);
if (failed > 0) process.exit(1);
