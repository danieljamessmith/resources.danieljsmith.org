import { describe, it, expect } from 'vitest';
import { findLayoutIssues, inlineMathSpans, layoutItems, solutionBodies } from './solution-layout.mjs';

/** Wraps body lines in a djsSolution box after a question statement. */
const box = (...body) =>
  ['Find \\(x\\).', '', '\\begin{djsSolution}', ...body, '\\end{djsSolution}'].join('\n');

const rules = (text) => findLayoutIssues(text).map((i) => i.rule);

describe('solutionBodies', () => {
  it('finds each box', () => {
    const lines = ['a', '\\begin{djsSolution}', 'b', '\\end{djsSolution}', '\\begin{djsSolution}', '\\end{djsSolution}'];
    expect(solutionBodies(lines)).toEqual([[1, 3], [4, 5]]);
  });
});

describe('layoutItems', () => {
  it('spans a multi-line display and records text either side', () => {
    const lines = ['So', '\\begin{align*}', 'x&=1\\\\', '&=2', '\\end{align*}', 'Done.'];
    const kinds = layoutItems(lines, 0, lines.length - 1).map((i) => i.kind);
    expect(kinds).toEqual(['text', 'display', 'text']);
  });

  it('does not treat a \\\\[4pt] row break as a display', () => {
    const lines = ['\\[', 'a\\\\[4pt]', 'b', '\\]'];
    const items = layoutItems(lines, 0, 3);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'display', line: 0, end: 3 });
  });

  it('skips the inside of a tikzpicture', () => {
    const lines = ['\\begin{tikzpicture}', '\\node at (0,0) {\\(x\\)};', '\\end{tikzpicture}', 'Text'];
    expect(layoutItems(lines, 0, 3).map((i) => i.kind)).toEqual(['struct', 'text']);
  });
});

describe('inlineMathSpans', () => {
  it('finds \\( \\) and $ $ spans', () => {
    const line = 'a \\(x\\) b $y$ c';
    expect(inlineMathSpans(line).map(([s, e]) => line.slice(s, e))).toEqual(['x', 'y']);
  });

  it('ignores \\\\( line breaks, escaped dollars and $$', () => {
    expect(inlineMathSpans('cost \\$5 \\\\(note) $$z$$')).toEqual([]);
  });
});

describe('findLayoutIssues', () => {
  it('accepts the house layout', () => {
    const text = box(
      'Let',
      '\\[',
      'I=\\int_0^1 \\dfrac{1}{x}\\,\\mathrm{d}x',
      '\\]',
      '',
      'so \\(v=\\frac32\\) and the speed is \\(4\\,\\mathrm{m\\,s}^{-1}\\).',
      '\\[',
      'y=\\arcsin\\left(\\frac{x}{2}\\right)',
      '\\]',
      '\\[',
      'z=\\frac{\\mathrm{d}}{\\mathrm{d}x}\\!\\left(x^2\\right)',
      '\\]',
    );
    expect(findLayoutIssues(text)).toEqual([]);
  });

  it('flags a blank line between a lead-in and its display', () => {
    expect(rules(box('Then', '', '\\[', 'x=1', '\\]'))).toEqual(['blank-before-display']);
  });

  it('flags a blank line between an \\item lead-in and its display', () => {
    const text = box('\\begin{enumerate}', '\\item First find \\(x\\):', '', '\\[', 'x=1', '\\]', '\\end{enumerate}');
    expect(rules(text)).toEqual(['blank-before-display']);
  });

  it('allows a bare \\item followed by a blank line and a display', () => {
    const text = box('\\begin{enumerate}', '\\item', '', '\\[', 'x=1', '\\]', '\\end{enumerate}');
    expect(rules(text)).toEqual([]);
  });

  it('flags a blank line between two displays', () => {
    expect(rules(box('So', '\\[', 'x=1', '\\]', '', '\\[', 'y=2', '\\]'))).toEqual(['blank-between-displays']);
  });

  it('flags text directly after a display, at the text line', () => {
    const issues = findLayoutIssues(box('So', '\\[', 'x=1', '\\]', 'Hence y.'));
    expect(issues).toEqual([expect.objectContaining({ rule: 'no-blank-after-display', line: 8 })]);
  });

  it('allows a display followed by structure or the end of the box', () => {
    const text = box('\\begin{enumerate}', '\\item So', '\\[', 'x=1', '\\]', '\\item Next', '\\end{enumerate}');
    expect(rules(text)).toEqual([]);
  });

  it('flags \\dfrac inside a sentence but not in a display or a tabular', () => {
    expect(rules(box('Since \\(\\sin\\alpha=\\dfrac{7}{25}\\), we have'))).toEqual(['inline-dfrac']);
    expect(rules(box('So', '\\[', 'x=\\dfrac12', '\\]'))).toEqual([]);
    expect(rules(box('\\begin{tabular}{c}', '$\\dfrac12$', '\\end{tabular}'))).toEqual([]);
  });

  it('flags \\text{ unit} in maths but not word units or text mode', () => {
    expect(rules(box('The work done is \\(14.7\\text{ J}\\).'))).toEqual(['text-unit']);
    expect(rules(box('So', '\\[', 'v=6.86\\text{ m s}^{-1}', '\\]'))).toEqual(['text-unit']);
    expect(rules(box('It takes \\(3\\text{ hours}\\).'))).toEqual([]);
    expect(rules(box('Then \\(n\\text{ is divisible by }3\\).'))).toEqual([]);
  });

  it('flags \\! before \\left after a function name or an inverse', () => {
    expect(rules(box('So', '\\[', 'y=\\arctan \\!\\left(x\\right)', '\\]'))).toEqual(['bang-before-left']);
    expect(rules(box('So', '\\[', 'y=\\tan^{-1}\\!\\left(x\\right)', '\\]'))).toEqual(['bang-before-left']);
  });

  it('ignores everything outside the solution box', () => {
    const text = ['Then', '', '\\[', 'x=\\dfrac12', '\\]', 'Hence \\(\\dfrac12\\).'].join('\n');
    expect(findLayoutIssues(text)).toEqual([]);
  });
});
