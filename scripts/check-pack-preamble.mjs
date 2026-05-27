/**
 * Read-only lint for the Further Maths shared pack preamble convention.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePath, walkTexFiles } from './lib/tex-utils.mjs';
import {
  checkPackPreambleConvention,
  isFurtherMathsPackTexFile,
} from './lib/pack-preamble.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fmRoot = join(repoRoot, 'public', 'tex', 'further-maths');
const packPreamblePath = join(repoRoot, 'public', 'tex', '_shared', 'pack_preamble.tex');
const mirrorPackPreamblePath = resolve(
  repoRoot,
  '..',
  '..',
  'tutoring-pipelines',
  'exam-question-perturbation',
  'resources',
  'pack_preamble.tex',
);

function main() {
  const files = walkTexFiles(fmRoot, repoRoot, isFurtherMathsPackTexFile).sort();
  const violations = [];

  for (const absPath of files) {
    const rel = normalizePath(relative(repoRoot, absPath));
    const text = readFileSync(absPath, 'utf8');
    violations.push(...checkPackPreambleConvention(text, rel));
  }

  if (existsSync(mirrorPackPreamblePath)) {
    const sitePreamble = readFileSync(packPreamblePath, 'utf8');
    const mirrorPreamble = readFileSync(mirrorPackPreamblePath, 'utf8');
    if (sitePreamble !== mirrorPreamble) {
      violations.push({
        kind: 'mirror-drift',
        message:
          'public/tex/_shared/pack_preamble.tex differs from exam-question-perturbation/resources/pack_preamble.tex',
      });
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`✗ [${v.kind}] ${v.message}`);
    }
    console.error(`\ncheck-pack-preamble: ${violations.length} violation(s)`);
    process.exit(1);
  }

  console.log(`check-pack-preamble: ${files.length} Further Maths pack file(s) clean`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
