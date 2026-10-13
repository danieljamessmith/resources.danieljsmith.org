import { describe, it, expect } from 'vitest';
import { bodyCommentViolations, isUnexpectedFullLineComment } from './check-tex.mjs';

describe('isUnexpectedFullLineComment', () => {
  it('returns false for a regular code line', () => {
    expect(isUnexpectedFullLineComment('\\item foo')).toBe(false);
  });

  it('returns false for a blank line', () => {
    expect(isUnexpectedFullLineComment('')).toBe(false);
    expect(isUnexpectedFullLineComment('   ')).toBe(false);
  });

  it('returns true for an arbitrary full-line comment', () => {
    expect(isUnexpectedFullLineComment('% some comment')).toBe(true);
  });

  it('returns true for an indented full-line comment', () => {
    expect(isUnexpectedFullLineComment('  % indented comment')).toBe(true);
  });

  it('returns false for an allowed question delimiter', () => {
    expect(isUnexpectedFullLineComment('% ---- Question 1 ----')).toBe(false);
    expect(isUnexpectedFullLineComment('% ---- Question 42 ----')).toBe(false);
  });

  it('returns true for a comment that nearly matches the delimiter format', () => {
    expect(isUnexpectedFullLineComment('% ---- Question ----')).toBe(true);
    expect(isUnexpectedFullLineComment('% --- Question 1 ---')).toBe(true);
  });

  it('returns false for a valid source hint', () => {
    expect(isUnexpectedFullLineComment('% [Source: _QBT__De_Moivres_Theorem, Q1]')).toBe(false);
    expect(isUnexpectedFullLineComment('% [Source: _QBT___Solns__De_Moivres_Theorem, Q42]')).toBe(false);
    expect(isUnexpectedFullLineComment('  % [Source: _QBT__Foo, Q1]')).toBe(false);
  });

  it('returns true for a malformed source hint', () => {
    expect(isUnexpectedFullLineComment('% [Source: foo bar, Q1]')).toBe(true);
    expect(isUnexpectedFullLineComment('% [Source: foo, Qx]')).toBe(true);
    expect(isUnexpectedFullLineComment('% [Source: , Q1]')).toBe(true);
  });

  it('returns false for a line with an inline comment after content', () => {
    expect(isUnexpectedFullLineComment('\\item foo % inline comment')).toBe(false);
  });
});

describe('bodyCommentViolations', () => {
  const doc = (body, tail = []) =>
    ['\\documentclass{article}', '% a preamble comment', '\\begin{document}', ...body, '\\end{document}', ...tail].join('\n');

  it('passes delimiters, source hints and inline comments', () => {
    const body = ['% ---- Question 1 ----', '\\questionitem', '% [Source: _QBT__Foo, Q1]', 'x % note'];
    expect(bodyCommentViolations(doc(body))).toEqual([]);
  });

  it('reports other full-line comments with their line numbers', () => {
    expect(bodyCommentViolations(doc(['\\questionitem', '% id: q1']))).toEqual([{ line: 5, text: '% id: q1' }]);
  });

  it('looks past \\end{document}, where no full-line comment is allowed', () => {
    expect(bodyCommentViolations(doc(['x'], ['% a note after the end', '% ---- Question 2 ----']))).toEqual([
      { line: 6, text: '% a note after the end' },
      { line: 7, text: '% ---- Question 2 ----' },
    ]);
  });

  it('does not end the body at a comment that mentions \\end{document}', () => {
    expect(bodyCommentViolations(doc(['% about \\end{document}', '% id: q1']))).toEqual([
      { line: 4, text: '% about \\end{document}' },
      { line: 5, text: '% id: q1' },
    ]);
  });

  it('throws when a boundary is missing', () => {
    expect(() => bodyCommentViolations('\\begin{document}\nx')).toThrow(/missing/);
  });
});
