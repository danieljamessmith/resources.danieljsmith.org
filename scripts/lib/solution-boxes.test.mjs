import { describe, expect, it } from 'vitest';
import {
  DJS_SOLUTION_CLOSER,
  DJS_SOLUTION_OPENER,
  LEGACY_SOLUTION_OPENER,
  migrateSolutionBoxes,
} from './solution-boxes.mjs';

function soln(eol = '\n') {
  return [
    String.raw`\begin{document}`,
    String.raw`\begin{enumerate}`,
    '% ---- Question 1 ----',
    String.raw`\questionitem`,
    'Statement.',
    String.raw`\begin{tcolorbox}[colback=white]`,
    'Info box in the statement.',
    String.raw`\end{tcolorbox}`,
    '',
    String.raw`\vspace*{10pt}`,
    '',
    LEGACY_SOLUTION_OPENER,
    'First solution.',
    String.raw`\end{tcolorbox}`,
    '',
    '% ---- Question 2 ----',
    String.raw`\questionitem`,
    'Statement.',
    '',
    String.raw`\vspace*{10pt}`,
    '',
    `  ${LEGACY_SOLUTION_OPENER}`,
    'Second solution.',
    String.raw`  \end{tcolorbox}`,
    String.raw`\end{enumerate}`,
    String.raw`\end{document}`,
    '',
  ].join(eol);
}

describe('migrateSolutionBoxes', () => {
  it('rewrites legacy Solution boxes and leaves statement tcolorboxes alone', () => {
    const { text, migrated, skipped } = migrateSolutionBoxes(soln());
    expect(migrated).toBe(2);
    expect(skipped).toEqual([]);
    const lines = text.split('\n');
    expect(lines[5]).toBe(String.raw`\begin{tcolorbox}[colback=white]`);
    expect(lines[7]).toBe(String.raw`\end{tcolorbox}`);
    expect(lines[11]).toBe(DJS_SOLUTION_OPENER);
    expect(lines[13]).toBe(DJS_SOLUTION_CLOSER);
    expect(lines[21]).toBe(`  ${DJS_SOLUTION_OPENER}`);
    expect(lines[23]).toBe(`  ${DJS_SOLUTION_CLOSER}`);
    expect(text).not.toContain('title={\\textbf{Solution}}');
  });

  it('is idempotent', () => {
    const once = migrateSolutionBoxes(soln()).text;
    const twice = migrateSolutionBoxes(once);
    expect(twice.migrated).toBe(0);
    expect(twice.text).toBe(once);
  });

  it('preserves CRLF line endings', () => {
    const { text } = migrateSolutionBoxes(soln('\r\n'));
    expect(text).toBe(migrateSolutionBoxes(soln()).text.split('\n').join('\r\n'));
  });

  it('preserves mixed line endings exactly', () => {
    const input = [LEGACY_SOLUTION_OPENER, '\r\nBody.\n', String.raw`\end{tcolorbox}`, '\r\n'].join('');
    const { text } = migrateSolutionBoxes(input);
    expect(text).toBe(`${DJS_SOLUTION_OPENER}\r\nBody.\n${DJS_SOLUTION_CLOSER}\r\n`);
  });

  it('pairs the opener with its own closer when a tcolorbox is nested inside', () => {
    const input = [
      LEGACY_SOLUTION_OPENER,
      String.raw`\begin{tcolorbox}[colback=white]`,
      'Inner.',
      String.raw`\end{tcolorbox}`,
      String.raw`\end{tcolorbox}`,
    ].join('\n');
    const lines = migrateSolutionBoxes(input).text.split('\n');
    expect(lines[3]).toBe(String.raw`\end{tcolorbox}`);
    expect(lines[4]).toBe(DJS_SOLUTION_CLOSER);
  });

  it('skips non-canonical, unclosed, and inline-closed Solution boxes', () => {
    const input = [
      String.raw`\begin{tcolorbox}[colback=white, title={\textbf{Solution}}]`,
      'A.',
      String.raw`\end{tcolorbox}`,
      LEGACY_SOLUTION_OPENER,
      String.raw`B. \end{tcolorbox}`,
      LEGACY_SOLUTION_OPENER,
      'C.',
    ].join('\n');
    const { text, migrated, skipped } = migrateSolutionBoxes(input);
    expect(migrated).toBe(0);
    expect(text).toBe(input);
    expect(skipped.map((s) => s.line)).toEqual([1, 4, 6]);
  });
});
