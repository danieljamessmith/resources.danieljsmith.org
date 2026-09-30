/**
 * One-shot codemod: migrate Further Maths QBT/Soln TeX files from inline
 * preambles to the shared pack preamble wrapper.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { normalizePath, walkTexFiles } from './lib/tex-utils.mjs';
import {
  isFurtherMathsPackTexFile,
  migratePackPreamble,
} from './lib/pack-preamble.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fmRoot = join(repoRoot, 'public', 'tex', 'further-maths');

function main() {
  const files = walkTexFiles(fmRoot, repoRoot, isFurtherMathsPackTexFile).sort();
  const fromGitHead = process.argv.includes('--from-git-head');
  let changed = 0;

  for (const absPath of files) {
    const rel = normalizePath(relative(repoRoot, absPath));
    const before = fromGitHead
      ? execFileSync('git', ['show', `HEAD:${rel}`], {
          cwd: repoRoot,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        })
      : readFileSync(absPath, 'utf8');
    const after = migratePackPreamble(before, rel);
    if (after !== before) {
      writeFileSync(absPath, after, 'utf8');
      changed++;
      console.log(`migrated ${rel}`);
    }
  }

  console.log(`migrate-fm-pack-preamble: ${changed}/${files.length} file(s) changed`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
