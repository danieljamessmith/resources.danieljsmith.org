/**
 * Read-only drift detector for QBT/soln pairs. Exits non-zero if any soln
 * file's per-question statement region differs from the corresponding QBT
 * statement, or if a pair is structurally broken (numbering mismatch,
 * duplicate delimiters, etc.).
 *
 * Usage:
 *   node scripts/check-questions.mjs [scope]
 *
 *   scope    further-maths (default) | tmua | all
 *
 * Wired into:
 *   - .husky/pre-commit (so a commit can't land in a drifted state)
 *   - npm pre* hooks for dev/build/check (so drift surfaces immediately)
 */

import { readFileSync } from 'node:fs';
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

/**
 * Renders a per-question drift report: shows the QBT statement and the
 * current SOLN statement side-by-side as `qbt|` / `soln|` prefixed lines.
 *
 * @param {string[]} qbtLines
 * @param {string[]} solnLines
 */
function formatDrift(qbtLines, solnLines) {
  const out = [];
  out.push('    --- qbt (source of truth) ---');
  for (const l of qbtLines) out.push(`    qbt | ${l}`);
  out.push('    --- soln (current) ---');
  for (const l of solnLines) out.push(`    soln| ${l}`);
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const scope = args.find((a) => !a.startsWith('-')) ?? 'further-maths';
  const searchRoot = resolveScope(scope);

  const { pairs, unpaired } = findPackPairs(searchRoot, repoRoot);

  if (pairs.length === 0 && unpaired.length === 0) {
    console.error(`check-questions: no qbt/soln pairs found under ${normalizePath(relative(repoRoot, searchRoot))}`);
    process.exit(1);
  }

  let drifted = 0;
  let broken = 0;
  let clean = 0;
  let warnings = 0;

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
      broken++;
      continue;
    }

    if (result.fatal) {
      console.error(`✗ ${pair.topicName}: structurally broken`);
      console.error(`    qbt:  ${qbtRel}`);
      console.error(`    soln: ${solnRel}`);
      for (const issue of result.issues) {
        const label = issue.n != null ? `Q${issue.n}` : '';
        console.error(`    [${issue.kind}] ${label} ${issue.detail ?? ''}`.trimEnd());
      }
      broken++;
      continue;
    }

    for (const issue of result.issues) {
      if (issue.kind === 'no-solution') {
        console.warn(`  (warn Q${issue.n}: no Solution tcolorbox yet) ${solnRel}`);
        warnings++;
      }
    }

    if (!result.changed) {
      clean++;
      continue;
    }

    drifted++;
    console.error(`✗ ${solnRel}: drift detected in Q${result.changes.map((c) => c.n).join(', Q')}`);
    for (const change of result.changes) {
      console.error(`  Q${change.n}:`);
      console.error(formatDrift(change.newStatement, change.oldStatement));
    }
  }

  for (const orphan of unpaired) {
    console.warn(
      `  (unpaired ${orphan.kind}) ${normalizePath(relative(repoRoot, orphan.path))}`,
    );
    warnings++;
  }

  const summary = `check-questions: ${clean} clean, ${drifted} drifted, ${broken} broken, ${warnings} warning(s)`;
  if (drifted > 0 || broken > 0) {
    console.error(`\n${summary}`);
    console.error(`\nRun \`npm run sync-questions\` to rewrite drifted soln files from QBT.`);
    process.exit(1);
  }
  console.log(summary);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
