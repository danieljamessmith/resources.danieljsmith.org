/**
 * Read-only verifier that the `*.generated.ts` files in `src/data/` are
 * byte-identical to what the generators would produce *right now*.
 *
 * Defends specifically against:
 *   - A commit landing with `--no-verify` after editing tex files but
 *     without ever running `npm run dev/build/check` (which would have
 *     re-run the generators).
 *   - A hand-edit to a `*.generated.ts` (forbidden by convention).
 *   - A deploy script landing a new tex file but the contributor committing
 *     before the npm pre-hooks fire.
 *
 * Wired into `.husky/pre-commit` only — NOT into the npm `pre*` hooks,
 * since those run the generators first and the check would be redundant.
 *
 * Usage:
 *   node scripts/check-generated.mjs
 *
 * Exits non-zero with a per-key add/remove/change diff if any generated
 * file is stale.
 */

import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeQuestionCounts,
  renderQuestionCountsModule,
  GENERATED_PATH as QUESTION_COUNTS_PATH,
} from './count-questions.mjs';
import {
  computeFileHashes,
  renderFileHashesModule,
  GENERATED_PATH as FILE_HASHES_PATH,
} from './hash-assets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/**
 * Parses the entries from a generated file body. Conservative regex against
 * the exact shape produced by the renderers (single-quoted keys, scalar
 * values). Used only for emitting a per-key diff when bodies differ; the
 * pass/fail decision is by full-string equality.
 *
 * @param {string} body
 * @returns {Map<string, string>} - key → raw value text (unquoted as written)
 */
function parseEntries(body) {
  const out = new Map();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*'([^']+)':\s*(.+?),?\s*$/);
    if (m) out.set(m[1], m[2].trim().replace(/,$/, ''));
  }
  return out;
}

/**
 * Renders a compact per-key diff between two generated bodies.
 *
 * @param {string} expected - what the generator would produce now
 * @param {string} actual   - what's on disk
 * @returns {string[]}
 */
function diffBodies(expected, actual) {
  const exp = parseEntries(expected);
  const act = parseEntries(actual);
  const keys = new Set([...exp.keys(), ...act.keys()]);
  const sorted = Array.from(keys).sort();
  const out = [];
  for (const k of sorted) {
    if (!act.has(k)) out.push(`    + ${k}: ${exp.get(k)}`);
    else if (!exp.has(k)) out.push(`    - ${k}: ${act.get(k)}`);
    else if (exp.get(k) !== act.get(k)) {
      out.push(`    ~ ${k}: on-disk=${act.get(k)} → would be=${exp.get(k)}`);
    }
  }
  return out;
}

/** @typedef {{ label: string; path: string; expected: string }} Target */

function main() {
  /** @type {Target[]} */
  const targets = [
    {
      label: 'questionCounts',
      path: QUESTION_COUNTS_PATH,
      expected: renderQuestionCountsModule(computeQuestionCounts()),
    },
    {
      label: 'fileHashes',
      path: FILE_HASHES_PATH,
      expected: renderFileHashesModule(computeFileHashes()),
    },
  ];

  let stale = 0;
  for (const t of targets) {
    let actual;
    try {
      actual = readFileSync(t.path, 'utf-8');
    } catch (e) {
      console.error(`✗ ${t.label}: cannot read ${relative(repoRoot, t.path)} (${e.code ?? e.message})`);
      stale++;
      continue;
    }
    if (actual === t.expected) continue;
    stale++;
    console.error(`✗ ${t.label}: ${relative(repoRoot, t.path)} is out of date`);
    const diff = diffBodies(t.expected, actual);
    if (diff.length === 0) {
      console.error('    (header/whitespace differs but no key-level changes)');
    } else {
      for (const line of diff) console.error(line);
    }
  }

  if (stale > 0) {
    console.error(
      `\ncheck-generated: ${stale} file(s) out of date. ` +
        `Run \`node scripts/count-questions.mjs && node scripts/hash-assets.mjs\` (or any \`npm run dev/build/check\`) and commit.`,
    );
    process.exit(1);
  }
  console.log(`check-generated: ${targets.length} file(s) up to date`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
