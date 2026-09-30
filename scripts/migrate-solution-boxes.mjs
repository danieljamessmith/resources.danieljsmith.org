/**
 * Codemod: migrate Further Maths SOLN packs from the legacy Solution
 * tcolorbox to the shared preamble's `djsSolution` environment.
 *
 * Idempotent: only canonical legacy boxes are rewritten, so it is safe to
 * re-run after an Overleaf import brings in old-style boxes.
 *
 * Usage:
 *   node scripts/migrate-solution-boxes.mjs [--dry-run] [path-filter...]
 *
 * Path filters are substrings matched against the repo-relative path, e.g.
 * `complex-series` to migrate a single pack. Exits non-zero if any Solution
 * box had to be skipped.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePath, walkTexFiles } from './lib/tex-utils.mjs';
import { isFurtherMathsPackTexFile, packKindFromPath } from './lib/pack-preamble.mjs';
import { migrateSolutionBoxes } from './lib/solution-boxes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fmRoot = join(repoRoot, 'public', 'tex', 'further-maths');

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filters = args.filter((a) => !a.startsWith('--'));

  const files = walkTexFiles(fmRoot, repoRoot, isFurtherMathsPackTexFile)
    .map((absPath) => ({ absPath, rel: normalizePath(relative(repoRoot, absPath)) }))
    .filter(({ rel }) => packKindFromPath(rel) === 'soln')
    .filter(({ rel }) => filters.length === 0 || filters.some((f) => rel.includes(f)))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  let changedFiles = 0;
  let boxes = 0;
  let skippedBoxes = 0;

  for (const { absPath, rel } of files) {
    const before = readFileSync(absPath, 'utf8');
    const { text, migrated, skipped } = migrateSolutionBoxes(before);
    for (const s of skipped) console.warn(`  skipped ${rel}:${s.line}: ${s.reason}`);
    skippedBoxes += skipped.length;
    if (migrated === 0) continue;
    if (!dryRun) writeFileSync(absPath, text, 'utf8');
    changedFiles++;
    boxes += migrated;
    console.log(`${dryRun ? 'would migrate' : 'migrated'} ${migrated} box(es) in ${rel}`);
  }

  console.log(
    `migrate-solution-boxes: ${boxes} box(es) in ${changedFiles}/${files.length} file(s)` +
      `${dryRun ? ' (dry run)' : ''}, ${skippedBoxes} skipped`,
  );
  if (skippedBoxes > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
