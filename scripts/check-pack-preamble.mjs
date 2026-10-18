/**
 * Read-only lint for the Further Maths shared pack preamble convention,
 * including `\djsMechanicsPack` in exactly the Further Mechanics packs and no
 * full-line comments before `\begin{document}`; and for the mark schemes'
 * rendered `.tex`, on the shared scheme preamble.
 */

import { readFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePath, walkTexFiles } from './lib/tex-utils.mjs';
import {
  checkPackPreambleComments,
  checkPackPreambleConvention,
  checkSchemePreambleConvention,
  isFurtherMathsPackTexFile,
  isFurtherMathsSchemeTexFile,
} from './lib/pack-preamble.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fmRoot = join(repoRoot, 'public', 'tex', 'further-maths');

function main() {
  const files = walkTexFiles(
    fmRoot,
    repoRoot,
    (rel) => isFurtherMathsPackTexFile(rel) || isFurtherMathsSchemeTexFile(rel),
  ).sort();
  const violations = [];
  let schemes = 0;

  for (const absPath of files) {
    const rel = normalizePath(relative(repoRoot, absPath));
    const text = readFileSync(absPath, 'utf8');
    if (isFurtherMathsSchemeTexFile(rel)) schemes++;
    violations.push(
      ...checkPackPreambleConvention(text, rel),
      ...checkSchemePreambleConvention(text, rel),
      ...checkPackPreambleComments(text, rel),
    );
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`✗ [${v.kind}] ${v.message}`);
    }
    console.error(`\ncheck-pack-preamble: ${violations.length} violation(s)`);
    process.exit(1);
  }

  console.log(
    `check-pack-preamble: ${files.length - schemes} Further Maths pack file(s) and ${schemes} mark scheme(s) clean`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
