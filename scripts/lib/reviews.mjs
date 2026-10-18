/**
 * Helpers for `src/data/reviews.json`, the record of when each pack's worked
 * solutions, and each mark scheme, were last checked. Used by `mark-checked`
 * and `review-status`.
 *
 * A pack's record is keyed by the solutions entry's id in `resources.ts` and
 * holds the check date plus a short hash of the pack's QBT and soln `.tex`
 * source at that time, so any later edit to either file shows the pack as
 * changed since its check. A mark scheme's record is keyed by the scheme
 * entry's id, and its hash covers the scheme's YAML as well as the pack's two
 * `.tex` files, so an edit to the scheme or to its pack shows the scheme as
 * changed.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionOrderChange } from './question-blocks.mjs';

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
 * Short md5 hash (first 8 hex chars) of a mark scheme's YAML and its pack's
 * QBT/soln `.tex` pair. As in `texPairHash`, line endings are normalised and
 * the last-updated lines (`last_updated:` in the YAML) are excluded.
 *
 * @param {string} yamlText
 * @param {string} qbtText
 * @param {string} solnText
 * @returns {string}
 */
export function schemeHash(yamlText, qbtText, solnText) {
  const yaml = yamlText.replace(/\r\n/g, '\n').replace(/^last_updated:[^\n]*(?:\n|$)/gm, '');
  return createHash('md5')
    .update(yaml)
    .update('\0')
    .update(texPairHash(qbtText, solnText))
    .digest('hex')
    .slice(0, 8);
}

/**
 * Carries a check across an edit that only put a pack's questions in a new
 * order. The record must match the pack as it was before the edit, and the
 * questions and solutions files must have been reordered the same way.
 * Returns the record to store: the original check date with the new hash.
 *
 * @param {ReviewRecord | undefined} record
 * @param {{ qbt: string, soln: string }} before - `.tex` text before the reorder
 * @param {{ qbt: string, soln: string }} after - `.tex` text after it
 * @returns {{ ok: true, record: ReviewRecord, order: number[] } | { ok: false, reason: string }}
 */
export function keepCheckAcrossReorder(record, before, after) {
  if (!record) return { ok: false, reason: 'the pack has no check to keep' };
  if (texPairHash(before.qbt, before.soln) !== record.texHash) {
    return { ok: false, reason: 'the pack had changed since its check before the reorder' };
  }
  const qbt = questionOrderChange(before.qbt, after.qbt);
  if (!qbt.ok) return { ok: false, reason: `questions file: ${qbt.reason}` };
  const soln = questionOrderChange(before.soln, after.soln);
  if (!soln.ok) return { ok: false, reason: `solutions file: ${soln.reason}` };
  if (qbt.order.join(',') !== soln.order.join(',')) {
    return { ok: false, reason: 'the questions and solutions files were reordered differently' };
  }
  return {
    ok: true,
    record: { checked: record.checked, texHash: texPairHash(after.qbt, after.soln) },
    order: qbt.order,
  };
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
 * Finds the sources a review record's hash covers: for a solutions id, the
 * pack's `.tex` pair; for a mark scheme id, the scheme's YAML (beside its PDF)
 * and its pack's `.tex` pair.
 *
 * @param {import('./resources-derive.mjs').ResourceEntry[]} entries
 * @param {string} id
 * @returns {{ ok: true, kind: 'solutions' | 'markscheme', qbtTex: string, solnTex: string, yaml?: string }
 *   | { ok: false, reason: string }}
 *   Paths are `/tex/...` URL paths; `yaml` is set for a mark scheme.
 */
export function resolveRecordSources(entries, id) {
  const e = entries.find((x) => x.id === id);
  if (!e) return { ok: false, reason: `no resource with id '${id}'` };
  if (e.type === 'solutions') {
    const r = resolvePackTex(entries, id);
    return r.ok ? { ...r, kind: 'solutions' } : r;
  }
  if (e.type !== 'markscheme') {
    return { ok: false, reason: `'${id}' is not a solutions or mark scheme entry` };
  }
  const questions = e.paperId ? entries.find((x) => x.id === e.paperId) : undefined;
  if (!questions?.pairId) return { ok: false, reason: `'${id}' names no pack with solutions` };
  const pack = resolvePackTex(entries, questions.pairId);
  if (!pack.ok) return pack;
  if (!e.file.endsWith('.pdf')) return { ok: false, reason: `'${id}' does not point at a PDF` };
  return { ...pack, kind: 'markscheme', yaml: e.file.replace(/\.pdf$/, '.yaml') };
}

/**
 * Classifies every solutions and mark scheme entry whose file starts with
 * `scopePrefix`. `currentHash(id)` returns the record's hash now, or null when
 * its sources can't be read; those are left out.
 *
 * @param {import('./resources-derive.mjs').ResourceEntry[]} entries
 * @param {Reviews} reviews
 * @param {(id: string) => string | null} currentHash
 * @param {string} scopePrefix - e.g. `/tex/further-maths/`, or `/tex/` for all
 * @returns {{ packs: PackStatus[], unknownIds: string[] }}
 *   `unknownIds` are record keys that match no solutions or mark scheme entry.
 */
export function reviewStatuses(entries, reviews, currentHash, scopePrefix) {
  /** @type {PackStatus[]} */
  const packs = [];
  for (const e of entries) {
    if (!isRecordType(e.type) || !e.file.startsWith(scopePrefix)) continue;
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
  const recordIds = new Set(entries.filter((e) => isRecordType(e.type)).map((e) => e.id));
  const unknownIds = Object.keys(reviews)
    .filter((id) => !recordIds.has(id))
    .sort();
  return { packs, unknownIds };
}

/** Solutions and mark schemes have review records. @param {string | undefined} type */
function isRecordType(type) {
  return type === 'solutions' || type === 'markscheme';
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
 * Reads a record's sources from disk and hashes them: a pack's `.tex` pair for
 * a solutions id, and the scheme's YAML with the pair for a mark scheme id.
 *
 * @param {import('./resources-derive.mjs').ResourceEntry[]} entries
 * @param {string} id - id of a solutions or mark scheme entry
 * @param {string} [publicDirArg]
 * @returns {{ ok: true, hash: string } | { ok: false, reason: string }}
 */
export function hashPackOnDisk(entries, id, publicDirArg = publicDir) {
  const r = resolveRecordSources(entries, id);
  if (!r.ok) return r;
  const urls = r.yaml ? [r.yaml, r.qbtTex, r.solnTex] : [r.qbtTex, r.solnTex];
  const texts = [];
  for (const url of urls) {
    const abs = join(publicDirArg, url);
    if (!existsSync(abs)) return { ok: false, reason: `missing public${url}` };
    texts.push(readFileSync(abs, 'utf8'));
  }
  return {
    ok: true,
    hash: r.yaml ? schemeHash(texts[0], texts[1], texts[2]) : texPairHash(texts[0], texts[1]),
  };
}
