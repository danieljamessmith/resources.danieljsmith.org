/**
 * Records that a pack's worked solutions have been checked: writes the date
 * and the pack's current `.tex` hash to src/data/reviews.json under the
 * solutions entry's id. Run it after the pack's last `.tex` edit and commit
 * the record together with those edits.
 *
 * Usage:
 *   node scripts/mark-checked.mjs <solutions-id> [--date YYYY-MM-DD]
 *
 * The date defaults to today. Exits non-zero if the id is not a solutions
 * entry with a readable `.tex` pair.
 */

import { fileURLToPath } from 'node:url';
import { loadResourcesEntries } from './lib/resources-derive.mjs';
import {
  hashPackOnDisk,
  isoDate,
  isValidIsoDate,
  readReviewsFile,
  writeReviewsAtomic,
} from './lib/reviews.mjs';

function main() {
  const args = process.argv.slice(2);
  const dateIdx = args.indexOf('--date');
  const date = dateIdx >= 0 ? args[dateIdx + 1] : isoDate(new Date());
  const id = args.find((a, i) => !a.startsWith('-') && (dateIdx < 0 || i !== dateIdx + 1));

  if (!id) {
    console.error('Usage: node scripts/mark-checked.mjs <solutions-id> [--date YYYY-MM-DD]');
    process.exit(1);
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
