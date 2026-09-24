/**
 * Pure helpers for the private-terms check. The term list itself never lives
 * in this repo; see scripts/check-private-terms.mjs for where it is loaded
 * from. Hits are reported by term number, never by term text, so logs stay
 * clean even when the list is supplied through CI.
 */

/**
 * Parse a term list: one term per line (or comma-separated), `#` comments and
 * blank entries ignored, surrounding whitespace trimmed.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseTermList(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .flatMap((line) => line.split(','))
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

/**
 * @typedef {Object} TermHit
 * @property {number} line     - 1-indexed line number
 * @property {number} termNo   - 1-indexed position in the term list
 */

/**
 * Case-insensitive whole-token search for every term, one hit per term per
 * line. A match must not have a letter or digit directly on either side, so
 * short terms do not fire inside hashes or longer words.
 *
 * @param {string} text
 * @param {string[]} terms
 * @returns {TermHit[]}
 */
export function findTermHits(text, terms) {
  const patterns = terms.map(
    (t) => new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i'),
  );
  /** @type {TermHit[]} */
  const hits = [];
  text.split(/\r?\n/).forEach((lineText, i) => {
    patterns.forEach((re, j) => {
      if (re.test(lineText)) hits.push({ line: i + 1, termNo: j + 1 });
    });
  });
  return hits;
}

/**
 * Heuristic binary sniff: a NUL byte in the first 8 KiB.
 *
 * @param {Uint8Array} buf
 * @returns {boolean}
 */
export function looksBinary(buf) {
  const end = Math.min(buf.length, 8192);
  for (let i = 0; i < end; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
