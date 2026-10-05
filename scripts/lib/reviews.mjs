/**
 * Helpers for `src/data/reviews.json`, the record of when each pack's worked
 * solutions were last checked. Used by `mark-checked` and `review-status`.
 *
 * Each record is keyed by the solutions entry's id in `resources.ts` and holds
 * the check date plus a short hash of the pack's QBT and soln `.tex` source at
 * that time, so any later edit to either file shows the pack as changed since
 * its check.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const publicDir = join(repoRoot, 'public');

export const REVIEWS_PATH = join(repoRoot, 'src', 'data', 'reviews.json');

/**
 * @typedef {Object} ReviewRecord
 * @property {string} checked  - `YYYY-MM-DD`
 * @property {string} texHash  - see `texPairHash`
 */

/** @typedef {Record<string, ReviewRecord>} Reviews */

/**
 * @typedef {Object} PackStatus
 * @property {string} id
 * @property {'current'|'changed'|'never'} status
 * @property {string} [checked]
 */

/**
 * Short md5 hash (first 8 hex chars) of a QBT/soln `.tex` pair. Line endings
 * are normalised and the last-updated metadata line is excluded, so a CRLF
 * checkout or a date-only edit does not invalidate a content review.
 *
 * @param {string} qbtText
 * @param {string} solnText
 * @returns {string}
 */
export function texPairHash(qbtText, solnText) {
  const norm = (/** @type {string} */ s) => s.replace(/\r\n/g, '\n')
    .replace(/^[ \t]*\\djsLastUpdated\{[^{}\n]*\}[ \t]*(?:%[^\n]*)?(?:\n|$)/gm, '');
  return createHash('md5')
    .update(norm(qbtText))
    .update('\0')
    .update(norm(solnText))
    .digest('hex')
    .slice(0, 8);
}

/**
 * Finds the `.tex` sources of the pack whose solutions entry has id `id`.
 *
 * @param {import('./resources-derive.mjs').ResourceEntry[]} entries
 * @param {string} id
 * @returns {{ ok: true, qbtTex: string, solnTex: string } | { ok: false, reason: string }}
 *   `qbtTex` and `solnTex` are `/tex/...` URL paths.
 */
export function resolvePackTex(entries, id) {
  const soln = entries.find((e) => e.id === id);
  if (!soln) return { ok: false, reason: `no resource with id '${id}'` };
  if (soln.type !== 'solutions') return { ok: false, reason: `'${id}' is not a solutions entry` };
  const qbt = soln.pairId ? entries.find((e) => e.id === soln.pairId) : undefined;
  if (!qbt) return { ok: false, reason: `'${id}' has no paired questions entry` };
  if (!soln.file.endsWith('.pdf') || !qbt.file.endsWith('.pdf')) {
    return { ok: false, reason: `'${id}' or its pair does not point at a PDF` };
  }
  const toTex = (/** @type {string} */ file) => file.replace(/\.pdf$/, '.tex');
  return { ok: true, qbtTex: toTex(qbt.file), solnTex: toTex(soln.file) };
}

/**
 * Classifies every solutions entry whose file starts with `scopePrefix`.
 * `currentHash(id)` returns the pack's hash now, or null when its `.tex` pair
 * can't be read; those packs are left out.
 *
 * @param {import('./resources-derive.mjs').ResourceEntry[]} entries
 * @param {Reviews} reviews
 * @param {(id: string) => string | null} currentHash
 * @param {string} scopePrefix - e.g. `/tex/further-maths/`, or `/tex/` for all
 * @returns {{ packs: PackStatus[], unknownIds: string[] }}
 *   `unknownIds` are record keys that match no solutions entry.
 */
export function reviewStatuses(entries, reviews, currentHash, scopePrefix) {
  /** @type {PackStatus[]} */
  const packs = [];
  for (const e of entries) {
    if (e.type !== 'solutions' || !e.file.startsWith(scopePrefix)) continue;
    const hash = currentHash(e.id);
    if (hash === null) continue;
    const rec = reviews[e.id];
    if (!rec) {
      packs.push({ id: e.id, status: 'never' });
    } else {
      packs.push({
        id: e.id,
        status: rec.texHash === hash ? 'current' : 'changed',
        checked: rec.checked,
      });
    }
  }
  const solutionIds = new Set(entries.filter((e) => e.type === 'solutions').map((e) => e.id));
  const unknownIds = Object.keys(reviews)
    .filter((id) => !solutionIds.has(id))
    .sort();
  return { packs, unknownIds };
}

/**
 * Parses `reviews.json`. Empty input gives `{}`.
 *
 * @param {string} text
 * @returns {Reviews}
 */
export function parseReviews(text) {
  if (text.trim() === '') return {};
  const raw = JSON.parse(text);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('reviews.json must hold a JSON object keyed by resource id');
  }
  return raw;
}

/**
 * Renders the record with ids sorted, so a rewrite only touches changed lines.
 *
 * @param {Reviews} reviews
 * @returns {string}
 */
export function renderReviews(reviews) {
  const sorted = Object.fromEntries(
    Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * Local calendar date as `YYYY-MM-DD`.
 *
 * @param {Date} d
 * @returns {string}
 */
export function isoDate(d) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * True for a real calendar date written `YYYY-MM-DD`.
 *
 * @param {string} s
 */
export function isValidIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d)) === s;
}

/**
 * Reads `reviews.json`, or `{}` if it doesn't exist yet.
 *
 * @param {string} [path]
 * @returns {Reviews}
 */
export function readReviewsFile(path = REVIEWS_PATH) {
  if (!existsSync(path)) return {};
  return parseReviews(readFileSync(path, 'utf8'));
}

/**
 * Atomic write: temp file in the same directory, then rename.
 *
 * @param {Reviews} reviews
 * @param {string} [path]
 */
export function writeReviewsAtomic(reviews, path = REVIEWS_PATH) {
  const tmp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(tmp, renderReviews(reviews), 'utf8');
  renameSync(tmp, path);
}

/**
 * Reads the pack's `.tex` pair from disk and hashes it.
 *
 * @param {import('./resources-derive.mjs').ResourceEntry[]} entries
 * @param {string} id - id of a solutions entry
 * @param {string} [publicDirArg]
 * @returns {{ ok: true, hash: string } | { ok: false, reason: string }}
 */
export function hashPackOnDisk(entries, id, publicDirArg = publicDir) {
  const r = resolvePackTex(entries, id);
  if (!r.ok) return r;
  const qbtAbs = join(publicDirArg, r.qbtTex);
  const solnAbs = join(publicDirArg, r.solnTex);
  for (const [abs, url] of [
    [qbtAbs, r.qbtTex],
    [solnAbs, r.solnTex],
  ]) {
    if (!existsSync(abs)) return { ok: false, reason: `missing public${url}` };
  }
  return {
    ok: true,
    hash: texPairHash(readFileSync(qbtAbs, 'utf8'), readFileSync(solnAbs, 'utf8')),
  };
}
