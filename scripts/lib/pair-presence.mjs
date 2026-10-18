/**
 * Pure quartet + tracked-missing checks for QBT/soln pack files under
 * public/tex, and for a pack's mark scheme in the `ms/` folder beside them.
 * See scripts/check-pairs.mjs for filesystem discovery.
 */

/**
 * @typedef {Object} PackTopicSlot
 * @property {string} topicKey        - stable join key: `${relTopicDir}::${topicName}`
 * @property {string} relTopicDir     - repo-relative parent of `qbt/` & `soln/` (forward slashes)
 * @property {string} topicName       - shared name after `_QBT__` / `_QBT___Solns__` / `_QBT___MS__`
 * @property {boolean} qbtTex
 * @property {boolean} qbtPdf
 * @property {boolean} solnTex
 * @property {boolean} solnPdf
 * @property {boolean} [msYaml]       - the mark scheme's data
 * @property {boolean} [msTex]        - the `.tex` rendered from it
 * @property {boolean} [msPdf]        - its deployed PDF
 */

/**
 * @typedef {Object} PairFinding
 * @property {'incomplete-quartet' | 'scheme-without-pack' | 'incomplete-scheme' | 'tracked-but-missing'} kind
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

    // A scheme belongs to a pack. Its YAML alone may be a draft; once it has
    // been rendered or published, the YAML, the .tex and the PDF go together.
    if ((s.msYaml || s.msTex || s.msPdf) && present === 0) {
      violations.push({
        kind: 'scheme-without-pack',
        message: `${s.relTopicDir}/ms (topic "${s.topicName}"): mark scheme with no QBT/soln pack beside it`,
      });
    }
    if (s.msTex || s.msPdf) {
      const msMissing = [];
      if (!s.msYaml) msMissing.push('.yaml');
      if (!s.msTex) msMissing.push('.tex');
      if (!s.msPdf) msMissing.push('.pdf');
      if (msMissing.length > 0) {
        violations.push({
          kind: 'incomplete-scheme',
          message: `${s.relTopicDir}/ms (topic "${s.topicName}"): mark scheme missing its ${msMissing.join(', ')}`,
        });
      }
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
