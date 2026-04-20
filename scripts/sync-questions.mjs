/**
 * Rewrites the statement region of every soln .tex file so that it matches
 * the corresponding qbt .tex file. The QBT file is the single source of
 * truth for question statements; the soln file owns the prelude + Solution
 * tcolorbox + trailing whitespace.
 *
 * Usage:
 *   node scripts/sync-questions.mjs [scope]
 *
 *   scope    further-maths (default) | tmua | all
 *
 * Pairs whose structure is broken (mismatched question numbers, duplicate
 * delimiters, missing solution tcolorboxes, etc.) are reported and skipped;
 * `check-questions.mjs` is the read-only sibling for use in CI / pre-commit.
 *
 * Mirrors the scope argument and logging style of `compile-tex.mjs` and
 * `clean-tex.mjs`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackPairs, normalizePath } from './lib/tex-utils.mjs';
import { syncPair } from './lib/question-blocks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

function resolveScope(scope) {
  if (scope === 'all') return texRoot;
  if (scope === 'further-maths') return join(texRoot, 'further-maths');
  return join(texRoot, scope);
}

function main() {
  const args = process.argv.slice(2);
  const scope = args.find((a) => !a.startsWith('-')) ?? 'further-maths';
  const searchRoot = resolveScope(scope);

  const { pairs, unpaired } = findPackPairs(searchRoot, repoRoot);

  if (pairs.length === 0 && unpaired.length === 0) {
    console.error(`sync-questions: no qbt/soln pairs found under ${normalizePath(relative(repoRoot, searchRoot))}`);
    process.exit(1);
  }

  console.log(`sync-questions: ${pairs.length} pair(s) | scope=${scope}\n`);

  let rewritten = 0;
  let unchanged = 0;
  let fatal = 0;

  for (const pair of pairs) {
    const qbtRel = normalizePath(relative(repoRoot, pair.qbtPath));
    const solnRel = normalizePath(relative(repoRoot, pair.solnPath));

    const qbtText = readFileSync(pair.qbtPath, 'utf8');
    const solnText = readFileSync(pair.solnPath, 'utf8');

    let result;
    try {
      result = syncPair(qbtText, solnText);
    } catch (e) {
      console.error(`✗ ${pair.topicName}: parse error: ${e.message || e}`);
      console.error(`    qbt:  ${qbtRel}`);
      console.error(`    soln: ${solnRel}`);
      fatal++;
      continue;
    }

    if (result.fatal) {
      console.error(`✗ ${pair.topicName}: structurally broken — skipped`);
      console.error(`    qbt:  ${qbtRel}`);
      console.error(`    soln: ${solnRel}`);
      for (const issue of result.issues) {
        const label = issue.n != null ? `Q${issue.n}` : '';
        console.error(`    [${issue.kind}] ${label} ${issue.detail ?? ''}`.trimEnd());
      }
      fatal++;
      continue;
    }

    for (const issue of result.issues) {
      if (issue.kind === 'no-solution') {
        console.warn(`  (skip Q${issue.n}: no Solution tcolorbox yet) ${solnRel}`);
      }
    }

    if (!result.changed) {
      unchanged++;
      continue;
    }

    writeFileSync(pair.solnPath, result.newSolnText, 'utf8');
    rewritten++;
    const ns = result.changes.map((c) => c.n).join(', ');
    console.log(`✓ ${solnRel}  (rewrote Q${ns})`);
  }

  for (const orphan of unpaired) {
    console.warn(
      `  (unpaired ${orphan.kind}) ${normalizePath(relative(repoRoot, orphan.path))}`,
    );
  }

  console.log(
    `\nsync-questions: ${rewritten} rewritten, ${unchanged} unchanged, ${fatal} broken, ${unpaired.length} unpaired`,
  );
  if (fatal > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
