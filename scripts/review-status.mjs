/**
 * Read-only report of when each pack's worked solutions were last checked,
 * from src/data/reviews.json. A pack whose `.tex` pair has changed since its
 * check is listed as changed.
 *
 * Usage:
 *   node scripts/review-status.mjs [scope | solutions-id]
 *
 *   scope    further-maths (default) | tmua | all
 *
 * Given a solutions id instead of a scope, reports that one pack.
 */

import { fileURLToPath } from 'node:url';
import { loadResourcesEntries } from './lib/resources-derive.mjs';
import { hashPackOnDisk, readReviewsFile, reviewStatuses } from './lib/reviews.mjs';

const GROUPS = /** @type {const} */ ([
  ['changed', 'Changed since last check'],
  ['never', 'Never checked'],
  ['current', 'Checked, unchanged since'],
]);

function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'further-maths';
  const entries = loadResourcesEntries();
  const singleId = entries.some((e) => e.id === arg && e.type === 'solutions') ? arg : null;
  const prefix = singleId || arg === 'all' ? '/tex/' : `/tex/${arg}/`;

  const currentHash = (/** @type {string} */ id) => {
    const r = hashPackOnDisk(entries, id);
    return r.ok ? r.hash : null;
  };
  const { packs: allPacks, unknownIds } = reviewStatuses(
    entries,
    readReviewsFile(),
    currentHash,
    prefix,
  );
  const packs = singleId ? allPacks.filter((p) => p.id === singleId) : allPacks;

  for (const [status, heading] of GROUPS) {
    const group = packs.filter((p) => p.status === status);
    if (group.length === 0) continue;
    console.log(`${heading}:`);
    for (const p of group) {
      console.log(p.checked ? `  ${p.id}  (checked ${p.checked})` : `  ${p.id}`);
    }
    console.log('');
  }
  for (const id of unknownIds) {
    console.warn(`  (warn) reviews.json records '${id}', which is not a solutions entry`);
  }

  const count = (/** @type {string} */ s) => packs.filter((p) => p.status === s).length;
  console.log(
    `review-status: ${packs.length} pack(s) | ${count('current')} checked, ` +
      `${count('changed')} changed since check, ${count('never')} never checked | ` +
      `${singleId ? `id=${singleId}` : `scope=${arg}`}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
