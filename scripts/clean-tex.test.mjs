import { describe, it, expect } from 'vitest';
import {
  isFullLineComment,
  stripBodyLines,
  collapseBlankRuns,
  insertQuestionDelimitersAndHints,
  processContent,
} from './clean-tex.mjs';

// ---------------------------------------------------------------------------
// isFullLineComment
// ---------------------------------------------------------------------------

describe('isFullLineComment', () => {
  it('returns true for a line starting with %', () => {
    expect(isFullLineComment('% some comment')).toBe(true);
  });

  it('returns true for a line starting with leading whitespace then %', () => {
    expect(isFullLineComment('  % indented comment')).toBe(true);
  });

  it('returns false for a blank line', () => {
    expect(isFullLineComment('')).toBe(false);
    expect(isFullLineComment('   ')).toBe(false);
  });

  it('returns false for a line with inline comment only after content', () => {
    expect(isFullLineComment('\\somecommand % with comment')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripBodyLines
// ---------------------------------------------------------------------------

describe('stripBodyLines', () => {
  it('removes full-line comment lines', () => {
    const input = ['% comment', '\\item foo', '% another'];
    expect(stripBodyLines(input)).toEqual(['\\item foo']);
  });

  it('preserves blank lines', () => {
    const input = ['', '\\item foo', ''];
    expect(stripBodyLines(input)).toEqual(['', '\\item foo', '']);
  });

  it('preserves lines with inline comments', () => {
    const input = ['\\item foo % inline'];
    expect(stripBodyLines(input)).toEqual(['\\item foo % inline']);
  });

  it('returns an empty array when all lines are comments', () => {
    expect(stripBodyLines(['% a', '% b'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// collapseBlankRuns
// ---------------------------------------------------------------------------

describe('collapseBlankRuns', () => {
  it('preserves runs of one or two blank lines', () => {
    const input = ['a', '', 'b', '', '', 'c'];
    expect(collapseBlankRuns(input)).toEqual(['a', '', 'b', '', '', 'c']);
  });

  it('collapses runs of three or more blank lines to two', () => {
    const input = ['a', '', '', '', 'b'];
    expect(collapseBlankRuns(input)).toEqual(['a', '', '', 'b']);
  });

  it('handles no blank lines', () => {
    const input = ['a', 'b', 'c'];
    expect(collapseBlankRuns(input)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty array', () => {
    expect(collapseBlankRuns([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// insertQuestionDelimitersAndHints
// ---------------------------------------------------------------------------

describe('insertQuestionDelimitersAndHints', () => {
  it('inserts a delimiter before and a source hint after each \\questionitem', () => {
    const input = ['\\questionitem', '\\item foo'];
    const result = insertQuestionDelimitersAndHints(input, '_QBT__Foo');
    expect(result[0]).toBe('% ---- Question 1 ----');
    expect(result[1]).toBe('\\questionitem');
    expect(result[2]).toBe('% [Source: _QBT__Foo, Q1]');
    expect(result[3]).toBe('\\item foo');
  });

  it('numbers delimiter and hint sequentially', () => {
    const input = ['\\questionitem', '\\questionitem'];
    const result = insertQuestionDelimitersAndHints(input, '_QBT__Foo');
    expect(result[0]).toBe('% ---- Question 1 ----');
    expect(result[1]).toBe('\\questionitem');
    expect(result[2]).toBe('% [Source: _QBT__Foo, Q1]');
    expect(result[3]).toBe('% ---- Question 2 ----');
    expect(result[4]).toBe('\\questionitem');
    expect(result[5]).toBe('% [Source: _QBT__Foo, Q2]');
  });

  it('leaves lines without \\questionitem unchanged', () => {
    const input = ['\\item foo', '\\item bar'];
    expect(insertQuestionDelimitersAndHints(input, '_QBT__Foo')).toEqual(input);
  });

  it('handles an empty array', () => {
    expect(insertQuestionDelimitersAndHints([], '_QBT__Foo')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// processContent (integration)
// ---------------------------------------------------------------------------

describe('processContent', () => {
  const wrap = (body) =>
    `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}`;
  const STEM = '_QBT__Foo';

  it('strips full-line comments from the body', () => {
    const input = wrap('% comment\n\\item foo');
    const result = processContent(input, STEM);
    expect(result).not.toContain('% comment\n');
    expect(result).toContain('\\item foo');
  });

  it('preserves the preamble and closing tag', () => {
    const input = wrap('\\item foo');
    const result = processContent(input, STEM);
    expect(result).toContain('\\documentclass{article}');
    expect(result).toContain('\\begin{document}');
    expect(result).toContain('\\end{document}');
  });

  it('inserts question delimiter and source hint for \\questionitem', () => {
    const input = wrap('\\questionitem\n\\item foo');
    const result = processContent(input, STEM);
    expect(result).toContain('% ---- Question 1 ----');
    expect(result).toContain('% [Source: _QBT__Foo, Q1]');
  });

  it('refreshes stale source hints on re-run (strip-then-reinsert)', () => {
    const stale = wrap('% [Source: _QBT__OldName, Q99]\n\\questionitem\n\\item foo');
    const result = processContent(stale, STEM);
    expect(result).not.toContain('_QBT__OldName');
    expect(result).toContain('% [Source: _QBT__Foo, Q1]');
  });

  it('is idempotent: running twice yields the same output', () => {
    const input = wrap('\\questionitem\n\\item foo\n\\questionitem\n\\item bar');
    const once = processContent(input, STEM);
    const twice = processContent(once, STEM);
    expect(twice).toBe(once);
  });

  it('throws for missing \\begin{document}', () => {
    expect(() => processContent('no document here', STEM)).toThrow();
  });

  it('collapses excessive blank lines', () => {
    const input = wrap('a\n\n\n\n\nb');
    const result = processContent(input, STEM);
    // Should not contain four consecutive newlines in the body
    expect(result).not.toMatch(/\n{5,}/);
  });
});
