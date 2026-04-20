/**
 * Pure validations of `src/data/resources.ts` against the filesystem and
 * generated count map. No I/O — callers are responsible for reading the
 * inputs (see `scripts/check-resources.mjs`).
 *
 * Each finding is either a `violation` (caller exits non-zero) or a
 * `warning` (caller logs and continues). The split is by severity:
 *
 *   violation: a structural inconsistency that will break the site or the
 *              splicer agent (missing file, duplicate id, broken pair link).
 *   warning:   surface for triage but does not block (orphan PDFs).
 *
 * `orphan-pdf` is intentionally a warning — the live corpus is expected
 * to surface a small backlog of these on first run, and they should not
 * block unrelated commits while that backlog is worked down. Promote to
 * violation once the corpus is clean.
 */

/**
 * @typedef {import('./resources-derive.mjs').ResourceEntry} ResourceEntry
 */

/**
 * @typedef {Object} Finding
 * @property {string} kind
 * @property {string} message
 * @property {string} [id]      - resource id at fault (when applicable)
 * @property {string} [file]    - `/tex/...` path at fault (when applicable)
 */

/**
 * @typedef {Object} CheckResult
 * @property {Finding[]} violations
 * @property {Finding[]} warnings
 */

/**
 * Validates the resource catalogue.
 *
 * @param {Object} input
 * @param {ResourceEntry[]} input.entries          - parsed `rawResources`
 * @param {Set<string>} input.diskFiles            - `/tex/...` paths that exist
 *                                                   on disk under `public/`
 * @param {Set<string>} input.deployedPdfs         - `/tex/...` PDF paths under
 *                                                   `public/tex/`, excluding
 *                                                   `build/` and `aux/`. Used
 *                                                   for orphan detection.
 * @param {Set<string>} input.questionCountKeys    - keys present in
 *                                                   `questionCounts.generated.ts`
 * @returns {CheckResult}
 */
export function checkResources({ entries, diskFiles, deployedPdfs, questionCountKeys }) {
  /** @type {Finding[]} */
  const violations = [];
  /** @type {Finding[]} */
  const warnings = [];

  const byId = new Map();

  // ---- Pass 1: per-entry checks (id uniqueness, file existence, count cov.)
  for (const e of entries) {
    if (byId.has(e.id)) {
      violations.push({
        kind: 'duplicate-id',
        id: e.id,
        message: `duplicate id '${e.id}' (also at ${byId.get(e.id).file})`,
      });
    } else {
      byId.set(e.id, e);
    }

    if (!diskFiles.has(e.file)) {
      violations.push({
        kind: 'missing-file',
        id: e.id,
        file: e.file,
        message: `'${e.id}' references ${e.file} which does not exist on disk`,
      });
    }

    if (e.type === 'questions' && /\/qbt\//.test(e.file) && !questionCountKeys.has(e.file)) {
      violations.push({
        kind: 'missing-question-count',
        id: e.id,
        file: e.file,
        message: `'${e.id}' is type:'questions' under /qbt/ but has no entry in questionCounts.generated.ts`,
      });
    }
  }

  // ---- Pass 2: pair link integrity (id resolution, symmetry, type/topic)
  for (const e of entries) {
    if (!e.pairId) continue;
    const partner = byId.get(e.pairId);
    if (!partner) {
      violations.push({
        kind: 'pair-id-unresolved',
        id: e.id,
        message: `'${e.id}' pairId '${e.pairId}' does not match any entry`,
      });
      continue;
    }
    // Asymmetry only fires when BOTH sides exist as entries; the
    // partner-missing case is `pair-id-unresolved` above. Without this
    // scoping we'd double-report the same root cause.
    if (partner.pairId !== e.id) {
      violations.push({
        kind: 'pair-asymmetry',
        id: e.id,
        message:
          `'${e.id}' → pairId '${partner.id}', but '${partner.id}'.pairId is ` +
          `${partner.pairId ? `'${partner.pairId}'` : 'unset'} (expected '${e.id}')`,
      });
      // Skip the type/topic checks — the link is one-sided so the comparison
      // would be misleading.
      continue;
    }
    if (e.type && partner.type) {
      const pair = new Set([e.type, partner.type]);
      const expected = pair.has('questions') && pair.has('solutions');
      if (!expected) {
        violations.push({
          kind: 'pair-type-mismatch',
          id: e.id,
          message:
            `pair {'${e.id}' (${e.type}), '${partner.id}' (${partner.type})} ` +
            `is not a {questions, solutions} pair`,
        });
      }
    }
    if (e.topic !== partner.topic) {
      violations.push({
        kind: 'pair-topic-mismatch',
        id: e.id,
        message:
          `pair partners disagree on topic: '${e.id}' topic=${quote(e.topic)} ` +
          `vs '${partner.id}' topic=${quote(partner.topic)}`,
      });
    }
    if (e.category !== partner.category) {
      violations.push({
        kind: 'pair-topic-mismatch',
        id: e.id,
        message:
          `pair partners disagree on category: '${e.id}' category='${e.category}' ` +
          `vs '${partner.id}' category='${partner.category}'`,
      });
    }
  }

  // ---- Pass 3: orphan PDFs (disk PDFs not referenced by any entry)
  const referencedFiles = new Set(entries.map((e) => e.file));
  for (const pdf of deployedPdfs) {
    if (!referencedFiles.has(pdf)) {
      warnings.push({
        kind: 'orphan-pdf',
        file: pdf,
        message: `${pdf} exists on disk but is not referenced by any resources.ts entry`,
      });
    }
  }

  return { violations, warnings };
}

/**
 * @param {string | undefined} v
 */
function quote(v) {
  return v === undefined ? 'undefined' : `'${v}'`;
}
