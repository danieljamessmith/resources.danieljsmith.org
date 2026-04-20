/**
 * Pure parser + sync logic for QBT/soln .tex pairs.
 *
 * Both files in a pair share the same per-question structure:
 *
 *   % ---- Question N ----
 *   \questionitem
 *   <statement (possibly multi-paragraph, may include its own tcolorboxes)>
 *
 * The soln file additionally appends, after the statement and before the
 * next question's delimiter:
 *
 *   \vspace*{10pt}                                   ← prelude (optional)
 *
 *   \begin{tcolorbox}[...title={\textbf{Solution}}...]
 *   ...
 *   \end{tcolorbox}
 *
 * The QBT file is the source of truth for the statement; the soln file owns
 * the prelude + Solution tcolorbox + any trailing whitespace/`\newpage`.
 */

import { findDocBoundaries } from './tex-utils.mjs';

const DELIM_RE = /^% ---- Question (\d+) ----$/;
const SOLUTION_TCOLORBOX_RE = /\\begin\{tcolorbox\}.*title=\{\\textbf\{Solution\}\}/;
const VSPACE_RE = /^\s*\\vspace\*\{[^}]*\}\s*$/;
const NEWPAGE_RE = /^\s*\\newpage\s*$/;

/**
 * @typedef {Object} QuestionBlock
 * @property {number} n              - Question number from the delimiter.
 * @property {string[]} lines        - Block lines, including the delimiter
 *                                     line at index 0 and excluding any
 *                                     subsequent delimiter or postamble line.
 */

/**
 * @typedef {Object} ParsedDoc
 * @property {string[]} fileLines    - Original file split into lines.
 * @property {string} eol            - The dominant line-ending of the input
 *                                     (`'\n'` or `'\r\n'`). Preserved across
 *                                     parse → serialize so Windows-edited
 *                                     files are not silently normalised.
 * @property {number} beginIdx       - Index of `\begin{document}` in fileLines.
 * @property {number} endIdx         - Index of `\end{document}` in fileLines.
 * @property {string[]} preamble     - Body lines before the first delimiter
 *                                     (empty if file has no questions).
 * @property {QuestionBlock[]} blocks
 * @property {string[]} postamble    - Body lines from the outer
 *                                     `\end{enumerate}` onwards (inclusive).
 */

/**
 * Splits a `.tex` file into preamble / per-question blocks / postamble.
 *
 * Throws if the document boundaries are missing or the question delimiters
 * are unparseable.
 *
 * @param {string} text
 * @returns {ParsedDoc}
 */
export function parseDoc(text) {
  // Preserve the original line endings on round-trip. A file with mixed
  // endings is treated as CRLF iff CRLF is in the majority (rare in practice).
  const crlfCount = (text.match(/\r\n/g) ?? []).length;
  const lfCount = (text.match(/(?<!\r)\n/g) ?? []).length;
  const eol = crlfCount > lfCount ? '\r\n' : '\n';

  const fileLines = text.split(/\r?\n/);
  const { beginIdx, endIdx } = findDocBoundaries(fileLines);
  if (beginIdx < 0 || endIdx < 0) {
    throw new Error('missing \\begin{document} or \\end{document}');
  }

  const bodyLines = fileLines.slice(beginIdx + 1, endIdx);

  /** @type {{ idx: number; n: number }[]} */
  const delims = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i].match(DELIM_RE);
    if (m) delims.push({ idx: i, n: Number(m[1]) });
  }

  if (delims.length === 0) {
    return {
      fileLines,
      eol,
      beginIdx,
      endIdx,
      preamble: bodyLines.slice(),
      blocks: [],
      postamble: [],
    };
  }

  // Postamble = the outer `\end{enumerate}` that closes the question list,
  // through the end of the body.
  //
  // Inner `\end{enumerate}` lines from nested part lists `(a)/(b)` also
  // appear at column 0 (LaTeX is whitespace-insensitive and the tex files
  // do not consistently indent the inner closes). They can appear both
  // inside the question statement AND inside the Solution tcolorbox, so the
  // outer close is identified as the LAST `^\end{enumerate}` line in the
  // body — anything after it is postamble (e.g. trailing whitespace or
  // signature blocks before `\end{document}`).
  let postambleStart = bodyLines.length;
  for (let i = bodyLines.length - 1; i >= 0; i--) {
    if (/^\\end\{enumerate\}\s*$/.test(bodyLines[i])) {
      postambleStart = i;
      break;
    }
  }

  const preamble = bodyLines.slice(0, delims[0].idx);
  const postamble = bodyLines.slice(postambleStart);

  /** @type {QuestionBlock[]} */
  const blocks = [];
  for (let k = 0; k < delims.length; k++) {
    const startIdx = delims[k].idx;
    const endIdxExcl = k + 1 < delims.length ? delims[k + 1].idx : postambleStart;
    blocks.push({ n: delims[k].n, lines: bodyLines.slice(startIdx, endIdxExcl) });
  }

  return { fileLines, eol, beginIdx, endIdx, preamble, blocks, postamble };
}

/**
 * Reassembles a `.tex` file from a ParsedDoc with possibly-modified blocks.
 *
 * @param {ParsedDoc} doc
 * @param {QuestionBlock[]} newBlocks
 * @returns {string}
 */
export function serializeDoc(doc, newBlocks) {
  const head = doc.fileLines.slice(0, doc.beginIdx + 1);
  const tail = doc.fileLines.slice(doc.endIdx);
  const blockLines = newBlocks.flatMap((b) => b.lines);
  return [...head, ...doc.preamble, ...blockLines, ...doc.postamble, ...tail].join(doc.eol);
}

/**
 * Strips trailing blank lines and `\newpage` lines from the end of a region.
 * Used when extracting the QBT statement (the source of truth): the QBT block
 * may end with `\newpage` to separate it from the next question, but that
 * separator belongs to the soln block's trailer, not to the statement itself.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
export function stripTrailingNewpage(lines) {
  const out = lines.slice();
  let changed = true;
  while (changed && out.length > 0) {
    changed = false;
    while (out.length > 0 && out[out.length - 1].trim() === '') {
      out.pop();
      changed = true;
    }
    if (out.length > 0 && NEWPAGE_RE.test(out[out.length - 1])) {
      out.pop();
      changed = true;
    }
  }
  return out;
}

/**
 * Extracts the statement region from a QBT question block.
 *
 * @param {QuestionBlock} block - The block, including the delimiter at [0].
 * @returns {string[]} - Lines of the statement (excludes the delimiter and
 *                       any trailing `\newpage`/blank-line separator).
 */
export function extractQbtStatement(block) {
  const afterDelim = block.lines.slice(1);
  return stripTrailingNewpage(afterDelim);
}

/**
 * @typedef {Object} SolnBlockSplit
 * @property {string[]} statement       - Statement lines (no delimiter).
 * @property {string[]} solutionRegion  - Prelude (`\vspace*{}` + blanks)
 *                                        + Solution tcolorbox + trailer
 *                                        (e.g. trailing `\newpage`).
 * @property {number} preludeStartIdx   - Index in `block.lines` where the
 *                                        statement ends and the prelude
 *                                        begins (i.e. start of the blank
 *                                        line preceding `\vspace*{}` /
 *                                        `\begin{tcolorbox}`).
 */

/**
 * Splits a soln block into statement vs prelude+solution+trailer.
 *
 * Returns `null` if the block has no Solution tcolorbox (work-in-progress).
 *
 * @param {QuestionBlock} block
 * @returns {SolnBlockSplit | null}
 */
export function splitSolnBlock(block) {
  const lines = block.lines;
  let tcolorboxIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (SOLUTION_TCOLORBOX_RE.test(lines[i])) {
      tcolorboxIdx = i;
      break;
    }
  }
  if (tcolorboxIdx < 0) return null;

  // Walk backwards through the prelude: blank lines, optional \vspace*{...},
  // blank lines. The first index that is part of the prelude is preludeStart.
  let preludeStart = tcolorboxIdx;
  // Skip blank lines immediately before the tcolorbox.
  while (preludeStart > 1 && lines[preludeStart - 1].trim() === '') preludeStart--;
  // Skip optional \vspace*{...} line.
  if (preludeStart > 1 && VSPACE_RE.test(lines[preludeStart - 1])) preludeStart--;
  // Skip blank lines immediately before the \vspace*{...}.
  while (preludeStart > 1 && lines[preludeStart - 1].trim() === '') preludeStart--;

  return {
    statement: lines.slice(1, preludeStart),
    solutionRegion: lines.slice(preludeStart),
    preludeStartIdx: preludeStart,
  };
}

/**
 * Replaces the statement region of a soln block with `newStatement`. The
 * delimiter, prelude, Solution tcolorbox, and trailer are preserved exactly.
 *
 * The boundary between statement and prelude is canonicalised: exactly one
 * blank line separates the last statement line from the prelude.
 *
 * @param {QuestionBlock} solnBlock
 * @param {string[]} newStatement
 * @returns {QuestionBlock | null} - `null` if the soln block has no solution.
 */
export function rewriteSolnStatement(solnBlock, newStatement) {
  const split = splitSolnBlock(solnBlock);
  if (!split) return null;

  // Strip trailing blanks from newStatement so we control the spacing.
  const trimmed = newStatement.slice();
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === '') trimmed.pop();

  // Strip leading blanks from solutionRegion: we'll re-insert a single blank.
  const sol = split.solutionRegion.slice();
  while (sol.length > 0 && sol[0].trim() === '') sol.shift();

  return {
    n: solnBlock.n,
    lines: [solnBlock.lines[0], ...trimmed, '', ...sol],
  };
}

/**
 * @typedef {Object} PairIssue
 * @property {'numbering-mismatch'|'qbt-only'|'soln-only'|'no-solution'|'duplicate-delim-qbt'|'duplicate-delim-soln'|'missing-questionitem-qbt'|'missing-questionitem-soln'|'extra-questionitem-qbt'|'extra-questionitem-soln'|'delim-numbering-gap-qbt'|'delim-numbering-gap-soln'} kind
 * @property {number} [n]
 * @property {string} [detail]
 */

/** Matches a `\questionitem` use (not a `\newcommand`/`\renewcommand` definition). */
const QUESTIONITEM_USE_RE = /\\questionitem\b/;
const QUESTIONITEM_DEF_RE = /\\(?:new|renew)command\b/;

/**
 * Counts `\questionitem` use-sites inside a single question block, excluding
 * any `\newcommand`/`\renewcommand` definitions (in case one ever appears
 * mid-document). The delimiter line at index 0 is skipped.
 *
 * @param {QuestionBlock} block
 * @returns {number}
 */
function countQuestionitems(block) {
  let n = 0;
  for (let i = 1; i < block.lines.length; i++) {
    const line = block.lines[i];
    if (QUESTIONITEM_USE_RE.test(line) && !QUESTIONITEM_DEF_RE.test(line)) n++;
  }
  return n;
}

/**
 * Validates a parsed document for issues a single file can have, independent
 * of its pair partner:
 *
 *   - `missing-questionitem-<side>` — a question block has no `\questionitem`.
 *   - `extra-questionitem-<side>`   — a question block has more than one.
 *   - `delim-numbering-gap-<side>`  — block delimiter Ns are not exactly
 *                                     `1..K` contiguous (catches both gaps
 *                                     like `1,2,4` and out-of-order like
 *                                     `1,3,2`). Duplicates are reported by
 *                                     the existing `duplicate-delim-<side>`
 *                                     check in `syncPair`.
 *
 * Side ('qbt' or 'soln') is appended to the kind so the caller can route
 * the diagnostic to the right file path.
 *
 * @param {ParsedDoc} doc
 * @param {'qbt' | 'soln'} side
 * @returns {PairIssue[]}
 */
export function validateBlocks(doc, side) {
  /** @type {PairIssue[]} */
  const issues = [];

  for (const block of doc.blocks) {
    const c = countQuestionitems(block);
    if (c === 0) {
      issues.push({ kind: `missing-questionitem-${side}`, n: block.n });
    } else if (c > 1) {
      issues.push({
        kind: `extra-questionitem-${side}`,
        n: block.n,
        detail: `${c} \\questionitem lines in this block`,
      });
    }
  }

  // Delimiter-numbering gap: only meaningful when the n's are not exactly
  // 1..K. Duplicates are already surfaced by `duplicate-delim-<side>` in
  // syncPair, so de-dupe before checking the contiguity to avoid double
  // reporting the same root cause.
  const ns = doc.blocks.map((b) => b.n);
  const uniqueNs = Array.from(new Set(ns));
  const expected = uniqueNs.length > 0 && uniqueNs.every((n, i) => n === i + 1);
  if (uniqueNs.length > 0 && !expected && uniqueNs.length === ns.length) {
    issues.push({
      kind: `delim-numbering-gap-${side}`,
      detail: `delimiters number ${ns.join(',')}, expected 1..${ns.length}`,
    });
  }

  return issues;
}

/**
 * @typedef {Object} BlockChange
 * @property {number} n
 * @property {string[]} oldStatement
 * @property {string[]} newStatement
 */

/**
 * @typedef {Object} SyncResult
 * @property {string} newSolnText        - Rewritten soln file text (may be
 *                                         identical to the input).
 * @property {boolean} changed           - True iff newSolnText !== input.
 * @property {BlockChange[]} changes     - One entry per rewritten block.
 * @property {PairIssue[]} issues        - Non-fatal issues (warnings).
 * @property {boolean} fatal             - True if the pair is structurally
 *                                         broken and was not rewritten.
 */

/**
 * Computes the QBT->soln statement-region rewrite for a single pair.
 *
 * Pure function: never reads/writes files.
 *
 * @param {string} qbtText
 * @param {string} solnText
 * @returns {SyncResult}
 */
export function syncPair(qbtText, solnText) {
  const qbtDoc = parseDoc(qbtText);
  const solnDoc = parseDoc(solnText);

  /** @type {PairIssue[]} */
  const issues = [];

  const qbtNs = qbtDoc.blocks.map((b) => b.n);
  const solnNs = solnDoc.blocks.map((b) => b.n);

  const qbtSet = new Set(qbtNs);
  const solnSet = new Set(solnNs);
  if (qbtSet.size !== qbtNs.length) {
    issues.push({ kind: 'duplicate-delim-qbt', detail: `qbt has duplicate question delimiters: ${qbtNs.join(',')}` });
  }
  if (solnSet.size !== solnNs.length) {
    issues.push({ kind: 'duplicate-delim-soln', detail: `soln has duplicate question delimiters: ${solnNs.join(',')}` });
  }

  for (const n of qbtNs) {
    if (!solnSet.has(n)) issues.push({ kind: 'qbt-only', n });
  }
  for (const n of solnNs) {
    if (!qbtSet.has(n)) issues.push({ kind: 'soln-only', n });
  }

  // Per-file structural issues (missing/extra \questionitem, delimiter
  // numbering gaps). These give a more actionable diagnostic than the
  // pair-level qbt-only/soln-only signals — e.g. they would have caught
  // the Modelling_with_1st_Order case as `missing-questionitem-soln Q14`
  // against the soln file rather than `qbt-only Q14` against the pair.
  issues.push(...validateBlocks(qbtDoc, 'qbt'));
  issues.push(...validateBlocks(solnDoc, 'soln'));

  // If the question-number sets differ, the pair is structurally broken: do
  // not rewrite. This catches the Modelling_with_1st_Order case where the
  // soln file is missing a \questionitem and the downstream questions are
  // off-by-one.
  const fatalKinds = new Set([
    'duplicate-delim-qbt',
    'duplicate-delim-soln',
    'missing-questionitem-qbt',
    'missing-questionitem-soln',
    'delim-numbering-gap-qbt',
    'delim-numbering-gap-soln',
  ]);
  const fatal =
    qbtNs.length !== solnNs.length ||
    qbtNs.some((n, i) => n !== solnNs[i]) ||
    issues.some((i) => fatalKinds.has(i.kind));

  if (fatal) {
    return { newSolnText: solnText, changed: false, changes: [], issues, fatal: true };
  }

  /** @type {Map<number, import('./question-blocks.mjs').QuestionBlock>} */
  const qbtByN = new Map(qbtDoc.blocks.map((b) => [b.n, b]));

  /** @type {BlockChange[]} */
  const changes = [];
  /** @type {QuestionBlock[]} */
  const newBlocks = [];

  for (const solnBlock of solnDoc.blocks) {
    const qbtBlock = qbtByN.get(solnBlock.n);
    if (!qbtBlock) {
      newBlocks.push(solnBlock);
      continue;
    }
    const split = splitSolnBlock(solnBlock);
    if (!split) {
      issues.push({ kind: 'no-solution', n: solnBlock.n });
      newBlocks.push(solnBlock);
      continue;
    }
    const qbtStatement = extractQbtStatement(qbtBlock);
    const rewritten = rewriteSolnStatement(solnBlock, qbtStatement);
    if (!rewritten) {
      newBlocks.push(solnBlock);
      continue;
    }
    if (!arraysEqual(rewritten.lines, solnBlock.lines)) {
      changes.push({ n: solnBlock.n, oldStatement: split.statement, newStatement: qbtStatement });
    }
    newBlocks.push(rewritten);
  }

  const newSolnText = serializeDoc(solnDoc, newBlocks);
  return {
    newSolnText,
    changed: newSolnText !== solnText,
    changes,
    issues,
    fatal: false,
  };
}

/**
 * @param {readonly unknown[]} a
 * @param {readonly unknown[]} b
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
