/**
 * Pure validations of `src/data/resources.ts` against the filesystem and
 * generated count map. No I/O — callers are responsible for reading the
 * inputs (see `scripts/check-resources.mjs`).
 *
 * Each finding is either a `violation` (caller exits non-zero) or a
 * `warning` (caller logs and continues). The split is by severity:
 *
 *   violation: a structural inconsistency that will break the site or the
 *              splicer agent (missing file, duplicate id, broken pair or
 *              answer-key link), or a Further Maths pack whose title or site
 *              path disagrees with what the site shows.
 *   warning:   surface for triage but does not block (orphan PDFs).
 *
 * `orphan-pdf` is intentionally a warning — the live corpus is expected
 * to surface a small backlog of these on first run, and they should not
 * block unrelated commits while that backlog is worked down. Promote to
 * violation once the corpus is clean.
 */

import { readPackIdentity } from './pack-preamble.mjs';
import { sitePathLabels } from './resources-derive.mjs';

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
 * @param {Map<string, string>} [input.packSources] - Further Maths pack `.tex`
 *                                                   text, keyed by the entry's
 *                                                   `/tex/...` PDF path
 * @param {import('./resources-derive.mjs').Strand[]} [input.strands]
 *                                                 - parsed `topics.ts`. With
 *                                                   `packSources`, enables the
 *                                                   pack title and site-path
 *                                                   checks
 * @returns {CheckResult}
 */
export function checkResources({
  entries, diskFiles, deployedPdfs, questionCountKeys, packSources, strands,
}) {
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

  // ---- Pass 3: answer keys (each names one questions entry by paperId)
  /** @type {Map<string, string>} paper id -> id of its answer key */
  const answerKeyOf = new Map();
  for (const e of entries) {
    if (e.type !== 'answers') {
      if (e.paperId) {
        violations.push({
          kind: 'paper-id-misplaced',
          id: e.id,
          message: `'${e.id}' has paperId but only type:'answers' entries name a paper`,
        });
      }
      continue;
    }
    if (!e.paperId) {
      violations.push({
        kind: 'answers-paper-missing',
        id: e.id,
        message: `'${e.id}' is type:'answers' but has no paperId`,
      });
      continue;
    }
    const paper = byId.get(e.paperId);
    if (!paper) {
      violations.push({
        kind: 'answers-paper-unresolved',
        id: e.id,
        message: `'${e.id}' paperId '${e.paperId}' does not match any entry`,
      });
      continue;
    }
    if (paper.type !== 'questions' || paper.category !== e.category) {
      violations.push({
        kind: 'answers-paper-mismatch',
        id: e.id,
        message:
          `'${e.id}' paperId '${paper.id}' must name a type:'questions' entry in ` +
          `category '${e.category}' (found ${paper.type ?? 'untyped'} in '${paper.category}')`,
      });
    }
    const earlier = answerKeyOf.get(paper.id);
    if (earlier) {
      violations.push({
        kind: 'answers-duplicate',
        id: e.id,
        message: `'${paper.id}' has two answer keys: '${earlier}' and '${e.id}'`,
      });
    } else {
      answerKeyOf.set(paper.id, e.id);
    }
  }

  // ---- Pass 4: Further Maths packs agree with the catalogue: the header's
  // topic (also the contents-page title) is the entry's title, and the site
  // path names the entry's strand and topic section as the site shows them.
  if (packSources && strands) {
    for (const e of entries) {
      const text = packSources.get(e.file);
      if (text === undefined) continue;
      const tex = e.file.replace(/\.pdf$/, '.tex');
      const { title, sitePath } = readPackIdentity(text);
      if (title !== null && e.title !== undefined && title !== e.title) {
        violations.push({
          kind: 'pack-title-mismatch',
          id: e.id,
          file: tex,
          message: `'${e.id}' title is '${e.title}' but ${tex} header says '${title}'`,
        });
      }
      const expected = sitePathLabels(strands, e.category, e.topic);
      if (!expected) continue;
      if (!sitePath) {
        violations.push({
          kind: 'pack-site-path-missing',
          id: e.id,
          file: tex,
          message: `${tex} needs \\djsSitePath{${expected.strand}}{${expected.section}} after its header`,
        });
      } else if (sitePath.strand !== expected.strand || sitePath.section !== expected.section) {
        violations.push({
          kind: 'pack-site-path-mismatch',
          id: e.id,
          file: tex,
          message:
            `${tex} site path is '${sitePath.strand} / ${sitePath.section}' but the site ` +
            `lists '${e.id}' under '${expected.strand} / ${expected.section}'`,
        });
      }
    }
  }

  // ---- Pass 5: orphan PDFs (disk PDFs not referenced by any entry)
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
