/**
 * Read-only lint: worked solutions in soln packs follow the source layout
 * that the djsSolution box's spacing relies on (see
 * scripts/lib/solution-layout.mjs for the rules).
 */

import { readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, shouldProcessTexFile, walkTexFiles } from './lib/tex-utils.mjs';
import { findLayoutIssues } from './lib/solution-layout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex', 'further-maths');

/** @param {string} rel */
function isSolnPack(rel) {
  return shouldProcessTexFile(rel) && normalizePath(rel).toLowerCase().includes('/soln/');
}

function main() {
  const files = walkTexFiles(texRoot, repoRoot, isSolnPack).sort();
  let count = 0;
  for (const absPath of files) {
    const rel = normalizePath(relative(repoRoot, absPath));
    for (const issue of findLayoutIssues(readFileSync(absPath, 'utf8'))) {
      console.error(`${rel}:${issue.line}: [${issue.rule}] ${issue.message}`);
      count++;
    }
  }
  if (count > 0) {
    console.error(`check-solution-layout: ${count} violation(s) in ${files.length} solutions pack(s)`);
    process.exit(1);
  }
  console.log(`check-solution-layout: ${files.length} solutions pack(s) clean`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
