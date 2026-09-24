/**
 * Pure codemod for SOLN packs: rewrites legacy Solution tcolorboxes to the
 * shared preamble's `djsSolution` environment.
 *
 *   \begin{tcolorbox}[colback=white, colframe=scarlet, title={\textbf{Solution}}, breakable, grow to left by=6mm, grow to right by=10mm]
 *   ...
 *   \end{tcolorbox}
 *
 * becomes
 *
 *   \begin{djsSolution}
 *   ...
 *   \end{djsSolution}
 *
 * Only the canonical legacy opener is migrated. Any other Solution-titled
 * tcolorbox is reported as skipped rather than guessed at, since its options
 * may carry intent the new box does not reproduce. `djsSolution` boxes are
 * never matched, so re-running over migrated files is a no-op.
 */

import { LEGACY_SOLUTION_OPEN_RE, findSolutionClose } from './question-blocks.mjs';

export const LEGACY_SOLUTION_OPENER = String.raw`\begin{tcolorbox}[colback=white, colframe=scarlet, title={\textbf{Solution}}, breakable, grow to left by=6mm, grow to right by=10mm]`;
const LEGACY_SOLUTION_CLOSER = String.raw`\end{tcolorbox}`;
export const DJS_SOLUTION_OPENER = String.raw`\begin{djsSolution}`;
export const DJS_SOLUTION_CLOSER = String.raw`\end{djsSolution}`;

/**
 * @typedef {Object} SkippedBox
 * @property {number} line    - 1-based line number of the opener.
 * @property {string} reason
 */

/**
 * @typedef {Object} MigrateResult
 * @property {string} text          - Rewritten text (identical if nothing migrated).
 * @property {number} migrated      - Number of boxes rewritten.
 * @property {SkippedBox[]} skipped - Solution tcolorboxes left untouched.
 */

/**
 * Rewrites every canonical legacy Solution tcolorbox in `text` to
 * `djsSolution`. Line endings (LF, CRLF or mixed) and each line's leading
 * indentation are preserved.
 *
 * @param {string} text
 * @returns {MigrateResult}
 */
export function migrateSolutionBoxes(text) {
  // Odd indexes hold the original line separators, so rejoining is lossless.
  const parts = text.split(/(\r?\n)/);
  const lines = parts.filter((_, i) => i % 2 === 0);

  let migrated = 0;
  /** @type {SkippedBox[]} */
  const skipped = [];

  for (let i = 0; i < lines.length; i++) {
    if (!LEGACY_SOLUTION_OPEN_RE.test(lines[i])) continue;

    if (lines[i].trim() !== LEGACY_SOLUTION_OPENER) {
      skipped.push({ line: i + 1, reason: 'non-canonical Solution tcolorbox opener' });
      continue;
    }
    const close = findSolutionClose(lines, i);
    if (close < 0) {
      skipped.push({ line: i + 1, reason: 'no matching \\end{tcolorbox}' });
      continue;
    }
    if (lines[close].trim() !== LEGACY_SOLUTION_CLOSER) {
      skipped.push({ line: i + 1, reason: `closing \\end{tcolorbox} on line ${close + 1} shares its line` });
      continue;
    }

    lines[i] = lines[i].replace(LEGACY_SOLUTION_OPENER, DJS_SOLUTION_OPENER);
    lines[close] = lines[close].replace(LEGACY_SOLUTION_CLOSER, DJS_SOLUTION_CLOSER);
    migrated++;
  }

  const out = parts.slice();
  for (let i = 0; i < lines.length; i++) out[i * 2] = lines[i];
  return { text: out.join(''), migrated, skipped };
}
