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
 * pair, or if `--reordered` can't show that only the order changed. The
 * command line is read strictly: an unknown flag, a second argument or a date
 * after today is refused rather than read as today's check.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
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

/**
 * The command line: one solutions id, and `--date YYYY-MM-DD` (default
 * today, never after it) or `--reordered`. Unknown flags and extra arguments
 * are refused, so a date that didn't arrive as written can't silently become
 * today's. `npm run` without `--` takes `--date` for itself, passes the date
 * on as a second argument and sets `npm_config_date`, which gets its own
 * message.
 *
 * @param {string[]} argv
 * @param {{ today?: string; env?: Record<string, string | undefined> }} [context]
 * @returns {{ ok: true; id: string; date: string; reordered: boolean } | { ok: false; message: string }}
 */
export function parseMarkCheckedArgs(argv, { today = isoDate(new Date()), env = process.env } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { date: { type: 'string' }, reordered: { type: 'boolean' } },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    return { ok: false, message: e.message };
  }
  const { values, positionals } = parsed;
  if (values.date === undefined && env.npm_config_date !== undefined) {
    return {
      ok: false,
      message: 'npm took --date for itself: put -- before the arguments (npm run mark-checked -- <solutions-id> --date YYYY-MM-DD)',
    };
  }
  if (positionals.length !== 1) {
    return {
      ok: false,
      message: positionals.length === 0 ? 'give a solutions id' : `give one solutions id, not ${positionals.join(' ')}`,
    };
  }
  if (values.reordered && values.date !== undefined) {
    return { ok: false, message: 'give --date or --reordered, not both' };
  }
  const date = values.date ?? today;
  if (!isValidIsoDate(date)) return { ok: false, message: `'${date}' is not a date in YYYY-MM-DD form` };
  if (date > today) return { ok: false, message: `${date} is after today (${today})` };
  return { ok: true, id: positionals[0], date, reordered: values.reordered === true };
}

function main() {
  const args = parseMarkCheckedArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(`mark-checked: ${args.message}`);
    console.error(USAGE);
    process.exit(1);
  }
  const { id, date, reordered } = args;
  if (reordered) {
    keepCheck(id);
    return;
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
