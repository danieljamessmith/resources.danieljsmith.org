/**
 * Pure validations of `src/data/resources.ts` against the filesystem and
 * generated count map. No I/O — callers are responsible for reading the
 * inputs (see `scripts/check-resources.mjs`).
 *
 * Each finding is either a `violation` (caller exits non-zero) or a
 * `warning` (caller logs and continues). The split is by severity:
 *
 *   violation: a structural inconsistency that will break the site (a row
 *              the parser can't read, missing file, duplicate id, broken pair,
 *              answer-key or mark-scheme link), a mark scheme row that isn't
 *              its pack's, a Further Maths row whose section or
 *              boards its strand doesn't have, or a Further Maths pack whose
 *              title or site path disagrees with what the site shows.
 *   warning:   surface for triage but does not block (orphan PDFs).
 *
 * `orphan-pdf` is intentionally a warning — the live corpus is expected
 * to surface a small backlog of these on first run, and they should not
 * block unrelated commits while that backlog is worked down. Promote to
 * violation once the corpus is clean.
 */

import { readPackIdentity } from './pack-preamble.mjs';
import { markSchemeFile, markSchemeId, sitePathLabels } from './resources-derive.mjs';

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
 *                                                 - parsed `topics.ts`, with
 *                                                   board ids resolved. Enables
 *                                                   the section and board
 *                                                   checks, and with
 *                                                   `packSources` the pack title
 *                                                   and site-path checks
 * @param {{ id: string; line: number }[]} [input.idKeys]
 *                                                 - every `id:` key in the
 *                                                   catalogue
 *                                                   (`catalogueIdKeys`). Enables
 *                                                   the unparsed-row check
 * @returns {CheckResult}
 */
export function checkResources({
  entries, diskFiles, deployedPdfs, questionCountKeys, packSources, strands, idKeys,
}) {
  /** @type {Finding[]} */
  const violations = [];
  /** @type {Finding[]} */
  const warnings = [];

  // ---- Pass 0: every `id:` key in the catalogue parsed as a row. The parser
  // reads rows by regex and skips one it can't read (a double-quoted id, say)
  // without a word, which drops the row from the site.
  if (idKeys) {
    const parsed = new Map();
    for (const e of entries) parsed.set(e.id, (parsed.get(e.id) ?? 0) + 1);
    for (const key of idKeys) {
      const left = parsed.get(key.id) ?? 0;
      if (left > 0) {
        parsed.set(key.id, left - 1);
        continue;
      }
      violations.push({
        kind: 'unparsed-row',
        id: key.id,
        message:
          `the row with id ${quote(key.id)} (resources.ts line ${key.line}) does not parse: ` +
          `write its id, file, type, pairId and topic in single quotes`,
      });
    }
  }

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

  // ---- Pass 3: answer keys and mark schemes (each names one questions entry
  // by paperId). A mark scheme also belongs to a Further Maths pack: its id is
  // the solutions id with -ms for -solns, its title the pack's, its file in the
  // pack's ms/ folder, and its boards are the questions row's.
  /** @type {Map<string, string>} `${type} ${paper id}` -> id of its answer key or scheme */
  const keyOf = new Map();
  for (const e of entries) {
    if (e.type !== 'answers' && e.type !== 'markscheme') {
      if (e.paperId) {
        violations.push({
          kind: 'paper-id-misplaced',
          id: e.id,
          message: `'${e.id}' has paperId but only type:'answers' and type:'markscheme' entries name a paper`,
        });
      }
      continue;
    }
    const kind = e.type;
    if (!e.paperId) {
      violations.push({
        kind: `${kind}-paper-missing`,
        id: e.id,
        message: `'${e.id}' is type:'${kind}' but has no paperId`,
      });
      continue;
    }
    const paper = byId.get(e.paperId);
    if (!paper) {
      violations.push({
        kind: `${kind}-paper-unresolved`,
        id: e.id,
        message: `'${e.id}' paperId '${e.paperId}' does not match any entry`,
      });
      continue;
    }
    if (paper.type !== 'questions' || paper.category !== e.category) {
      violations.push({
        kind: `${kind}-paper-mismatch`,
        id: e.id,
        message:
          `'${e.id}' paperId '${paper.id}' must name a type:'questions' entry in ` +
          `category '${e.category}' (found ${paper.type ?? 'untyped'} in '${paper.category}')`,
      });
    } else if (kind === 'markscheme') {
      violations.push(...markSchemeFindings(e, paper, byId));
    }
    const earlier = keyOf.get(`${kind} ${paper.id}`);
    if (earlier) {
      violations.push({
        kind: `${kind}-duplicate`,
        id: e.id,
        message:
          `'${paper.id}' has two ${kind === 'answers' ? 'answer keys' : 'mark schemes'}: ` +
          `'${earlier}' and '${e.id}'`,
      });
    } else {
      keyOf.set(`${kind} ${paper.id}`, e.id);
    }
  }

  // ---- Pass 4: a Further Maths row is filed under a topic section its strand
  // has in topics.ts (otherwise no strand page lists it), and its boards are
  // boards of that strand.
  if (strands) {
    for (const e of entries) {
      const strand = strands.find((s) => s.category === e.category);
      if (!strand) continue;
      if (!strand.topics.some((t) => t.topic === e.topic)) {
        violations.push({
          kind: 'unknown-section',
          id: e.id,
          message:
            `'${e.id}' topic ${quote(e.topic)} is not a ${strand.title} section in topics.ts ` +
            `(sections: ${strand.topics.map((t) => `'${t.topic}'`).join(', ')})`,
        });
      }
      if (!e.boards || !strand.boards) continue;
      for (const board of e.boards) {
        if (strand.boards.includes(board)) continue;
        violations.push({
          kind: 'board-not-in-strand',
          id: e.id,
          message:
            `'${e.id}' board '${board}' is not a ${strand.title} board ` +
            `(${strand.boardsConst ?? 'its list'}: ${strand.boards.join(', ')})`,
        });
      }
    }
  }

  // ---- Pass 5: Further Maths packs agree with the catalogue: the header's
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

  // ---- Pass 6: orphan PDFs (disk PDFs not referenced by any entry)
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
 * What is wrong with a mark scheme row whose `paperId` names a questions entry
 * of its category.
 *
 * @param {ResourceEntry} e
 * @param {ResourceEntry} paper
 * @param {Map<string, ResourceEntry>} byId
 * @returns {Finding[]}
 */
function markSchemeFindings(e, paper, byId) {
  /** @type {Finding[]} */
  const out = [];
  const add = (/** @type {string} */ kind, /** @type {string} */ message) =>
    out.push({ kind, id: e.id, message });
  const solutions = paper.pairId ? byId.get(paper.pairId) : undefined;
  if (!solutions || solutions.type !== 'solutions') {
    add('markscheme-no-solutions', `'${e.id}' names '${paper.id}', which has no solutions entry`);
  } else {
    const expected = markSchemeId(solutions.id);
    if (e.id !== expected) {
      add(
        'markscheme-id-mismatch',
        `'${e.id}' should be ${quote(expected ?? undefined)}: the solutions id '${solutions.id}' with -ms for -solns`,
      );
    }
  }
  if (e.title !== paper.title) {
    add('markscheme-title-mismatch', `'${e.id}' title is ${quote(e.title)} but its pack's is ${quote(paper.title)}`);
  }
  if (e.description !== 'Mark scheme') {
    add('markscheme-description', `'${e.id}' description is ${quote(e.description)}, not 'Mark scheme'`);
  }
  if (e.topic !== paper.topic) {
    add('markscheme-topic-mismatch', `'${e.id}' topic is ${quote(e.topic)} but its pack's is ${quote(paper.topic)}`);
  }
  const file = markSchemeFile(paper.file);
  if (file !== e.file) {
    add(
      'markscheme-file-mismatch',
      file
        ? `'${e.id}' file is ${e.file} but its pack's scheme is ${file}`
        : `'${e.id}' names '${paper.id}', which is not a Further Maths questions pack`,
    );
  }
  if (e.pairId) {
    add('markscheme-pair-id', `'${e.id}' has pairId: a mark scheme names its pack by paperId only`);
  }
  if (e.boards) {
    add('markscheme-boards', `'${e.id}' has boards: a mark scheme takes its pack's from '${paper.id}'`);
  }
  return out;
}

/**
 * @param {string | undefined} v
 */
function quote(v) {
  return v === undefined ? 'undefined' : `'${v}'`;
}
