/**
 * Records that a pack's worked solutions have been checked: writes the date
 * and the pack's current `.tex` hash to src/data/reviews.json under the
 * solutions entry's id. Run it after the pack's last `.tex` edit and commit
 * the record together with those edits.
 *
 * Usage:
 *   node scripts/mark-checked.mjs <solutions-id> [--date YYYY-MM-DD]
 *   node scripts/mark-checked.mjs <solutions-id> --reordered
 *
 * The date defaults to today. With `--reordered`, the pack's questions have
 * only been put in a new order since the last commit: the existing check date
 * is kept and only the hash is updated. That needs the committed pack to match
 * its record, and both `.tex` files to be the committed ones with their
 * questions reordered the same way (the `\djsLastUpdated` dates may differ).
 *
 * Exits non-zero if the id is not a solutions entry with a readable `.tex`
 * pair, or if `--reordered` can't show that only the order changed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadResourcesEntries } from './lib/resources-derive.mjs';
import {
  hashPackOnDisk,
  isoDate,
  isValidIsoDate,
  keepCheckAcrossReorder,
  readReviewsFile,
  resolvePackTex,
  writeReviewsAtomic,
} from './lib/reviews.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE =
  'Usage: node scripts/mark-checked.mjs <solutions-id> [--date YYYY-MM-DD | --reordered]';

/**
 * The committed (HEAD) text of a `/tex/...` path under public/.
 *
 * @param {string} urlPath
 * @returns {string}
 */
function committedText(urlPath) {
  return execFileSync('git', ['show', `HEAD:public${urlPath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** @param {string} id */
function keepCheck(id) {
  const tex = resolvePackTex(loadResourcesEntries(), id);
  if (!tex.ok) {
    console.error(`mark-checked: ${tex.reason}`);
    process.exit(1);
  }
  let before;
  try {
    before = { qbt: committedText(tex.qbtTex), soln: committedText(tex.solnTex) };
  } catch {
    console.error(`mark-checked: '${id}' has no committed .tex pair to compare with`);
    process.exit(1);
  }
  const after = {
    qbt: readFileSync(join(repoRoot, 'public', tex.qbtTex), 'utf8'),
    soln: readFileSync(join(repoRoot, 'public', tex.solnTex), 'utf8'),
  };
  const reviews = readReviewsFile();
  const result = keepCheckAcrossReorder(reviews[id], before, after);
  if (!result.ok) {
    console.error(`mark-checked: can't keep the check for ${id}: ${result.reason}`);
    process.exit(1);
  }
  reviews[id] = result.record;
  writeReviewsAtomic(reviews);
  console.log(
    `mark-checked: ${id} reordered (old numbers ${result.order.join(', ')}); ` +
      `check of ${result.record.checked} kept (tex ${result.record.texHash})`,
  );
}

function main() {
  const args = process.argv.slice(2);
  const dateIdx = args.indexOf('--date');
  const reordered = args.includes('--reordered');
  const date = dateIdx >= 0 ? args[dateIdx + 1] : isoDate(new Date());
  const id = args.find((a, i) => !a.startsWith('-') && (dateIdx < 0 || i !== dateIdx + 1));

  if (!id || (reordered && dateIdx >= 0)) {
    console.error(USAGE);
    process.exit(1);
  }
  if (reordered) {
    keepCheck(id);
    return;
  }
  if (!date || !isValidIsoDate(date)) {
    console.error(`mark-checked: '${date}' is not a date in YYYY-MM-DD form`);
    process.exit(1);
  }

  const result = hashPackOnDisk(loadResourcesEntries(), id);
  if (!result.ok) {
    console.error(`mark-checked: ${result.reason}`);
    process.exit(1);
  }

  const reviews = readReviewsFile();
  reviews[id] = { checked: date, texHash: result.hash };
  writeReviewsAtomic(reviews);
  console.log(`mark-checked: ${id} checked ${date} (tex ${result.hash})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
