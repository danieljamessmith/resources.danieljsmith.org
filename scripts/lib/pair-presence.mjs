/**
 * Pure quartet + tracked-missing checks for QBT/soln pack files under
 * public/tex. See scripts/check-pairs.mjs for filesystem discovery.
 */

/**
 * @typedef {Object} PackTopicSlot
 * @property {string} topicKey        - stable join key: `${relTopicDir}::${topicName}`
 * @property {string} relTopicDir     - repo-relative parent of `qbt/` & `soln/` (forward slashes)
 * @property {string} topicName       - shared name after `_QBT__` / `_QBT___Solns__`
 * @property {boolean} qbtTex
 * @property {boolean} qbtPdf
 * @property {boolean} solnTex
 * @property {boolean} solnPdf
 */

/**
 * @typedef {Object} PairFinding
 * @property {'incomplete-quartet' | 'tracked-but-missing'} kind
 * @property {string} message
 * @property {string} [file]        - repo-relative, when applicable
 */

/**
 * @param {PackTopicSlot[]} slots
 * @param {string[]} trackedMissing - repo-relative paths
 * @returns {{ violations: PairFinding[] }}
 */
export function checkPairPresence(slots, trackedMissing) {
  /** @type {PairFinding[]} */
  const violations = [];

  for (const s of slots) {
    const missing = [];
    if (!s.qbtTex) missing.push('qbt .tex');
    if (!s.qbtPdf) missing.push('qbt .pdf');
    if (!s.solnTex) missing.push('soln .tex');
    if (!s.solnPdf) missing.push('soln .pdf');
    const present = 4 - missing.length;
    if (present > 0 && present < 4) {
      violations.push({
        kind: 'incomplete-quartet',
        message: `${s.relTopicDir} (topic "${s.topicName}"): incomplete quartet — missing ${missing.join(', ')}`,
      });
    }
  }

  for (const p of trackedMissing) {
    const norm = p.replace(/\\/g, '/');
    violations.push({
      kind: 'tracked-but-missing',
      file: norm,
      message: `tracked in git index but missing from working tree: ${norm}`,
    });
  }

  return { violations };
}
