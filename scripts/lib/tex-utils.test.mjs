import { describe, it, expect } from 'vitest';
import { normalizePath, shouldProcessTexFile, findDocBoundaries } from './tex-utils.mjs';

// ---------------------------------------------------------------------------
// normalizePath
// ---------------------------------------------------------------------------

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('public\\tex\\further-maths\\core-pure')).toBe('public/tex/further-maths/core-pure');
  });

  it('leaves forward-slash paths unchanged', () => {
    expect(normalizePath('public/tex/further-maths/core-pure')).toBe('public/tex/further-maths/core-pure');
  });

  it('handles mixed separators', () => {
    expect(normalizePath('a\\b/c\\d')).toBe('a/b/c/d');
  });
});

// ---------------------------------------------------------------------------
// shouldProcessTexFile
// ---------------------------------------------------------------------------

describe('shouldProcessTexFile', () => {
  it('returns true for a qbt .tex file', () => {
    expect(shouldProcessTexFile('public/tex/further-maths/core-pure/complex-numbers/qbt/_QBT__Topic.tex')).toBe(true);
  });

  it('returns true for a soln .tex file', () => {
    expect(shouldProcessTexFile('public/tex/further-maths/core-pure/complex-numbers/soln/_QBT___Solns__Topic.tex')).toBe(true);
  });

  it('returns false for a notes .tex file', () => {
    expect(shouldProcessTexFile('public/tex/further-maths/core-pure/complex-numbers/notes/notes.tex')).toBe(false);
  });

  it('returns false for a .pdf file', () => {
    expect(shouldProcessTexFile('public/tex/further-maths/core-pure/complex-numbers/qbt/_QBT__Topic.pdf')).toBe(false);
  });

  it('returns false for a path outside qbt or soln', () => {
    expect(shouldProcessTexFile('public/tex/further-maths/core-pure/complex-numbers/other/file.tex')).toBe(false);
  });

  it('is case-insensitive for path segments and extension', () => {
    // The function lowercases the entire path, so uppercase variants all match.
    expect(shouldProcessTexFile('public/tex/Further-Maths/Complex-Numbers/QBT/_QBT__Topic.tex')).toBe(true);
    expect(shouldProcessTexFile('public/tex/Further-Maths/Complex-Numbers/QBT/_QBT__Topic.TEX')).toBe(true);
    expect(shouldProcessTexFile('public/tex/further-maths/core-pure/complex-numbers/SOLN/_QBT__Topic.tex')).toBe(true);
  });

  it('handles Windows-style backslash paths', () => {
    expect(
      shouldProcessTexFile('public\\tex\\further-maths\\core-pure\\complex-numbers\\qbt\\_QBT__Topic.tex'),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findDocBoundaries
// ---------------------------------------------------------------------------

describe('findDocBoundaries', () => {
  it('finds correct indices for a simple document', () => {
    const lines = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\item foo',
      '\\end{document}',
    ];
    expect(findDocBoundaries(lines)).toEqual({ beginIdx: 1, endIdx: 3 });
  });

  it('returns -1 when \\begin{document} is missing', () => {
    const lines = ['\\item foo', '\\end{document}'];
    expect(findDocBoundaries(lines)).toEqual({ beginIdx: -1, endIdx: 1 });
  });

  it('returns -1 when \\end{document} is missing', () => {
    const lines = ['\\begin{document}', '\\item foo'];
    expect(findDocBoundaries(lines)).toEqual({ beginIdx: 0, endIdx: -1 });
  });

  it('returns -1 for both when the array is empty', () => {
    expect(findDocBoundaries([])).toEqual({ beginIdx: -1, endIdx: -1 });
  });

  it('uses the first \\begin{document} found', () => {
    const lines = [
      '\\begin{document}',
      '% body',
      '\\begin{document}',
      '\\end{document}',
    ];
    expect(findDocBoundaries(lines)).toEqual({ beginIdx: 0, endIdx: 3 });
  });
});
