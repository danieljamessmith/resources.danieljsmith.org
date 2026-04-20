import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePath, shouldProcessTexFile, findDocBoundaries, findPackPairs } from './tex-utils.mjs';

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

// ---------------------------------------------------------------------------
// findPackPairs
// ---------------------------------------------------------------------------

describe('findPackPairs', () => {
  /** @type {string} */
  let tmpRoot;

  /**
   * Creates a fixture tree. `entries` is a map of relative-path → contents
   * (empty string is fine — the file just needs to exist).
   * @param {Record<string, string>} entries
   */
  function fixture(entries) {
    for (const [rel, body] of Object.entries(entries)) {
      const abs = join(tmpRoot, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, body);
    }
  }

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'pack-pairs-'));
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('pairs matching qbt/soln files by topic name', () => {
    fixture({
      'public/tex/fm/core-pure/vectors/qbt/_QBT__Vector_Product.tex': '',
      'public/tex/fm/core-pure/vectors/soln/_QBT___Solns__Vector_Product.tex': '',
      'public/tex/fm/core-pure/vectors/qbt/_QBT__Plane_Intersections.tex': '',
      'public/tex/fm/core-pure/vectors/soln/_QBT___Solns__Plane_Intersections.tex': '',
    });

    const { pairs, unpaired } = findPackPairs(join(tmpRoot, 'public/tex/fm'), tmpRoot);
    expect(pairs).toHaveLength(2);
    expect(unpaired).toEqual([]);
    const topics = pairs.map((p) => p.topicName).sort();
    expect(topics).toEqual(['Plane_Intersections', 'Vector_Product']);
    const pi = pairs.find((p) => p.topicName === 'Plane_Intersections');
    expect(pi.qbtPath).toMatch(/qbt[/\\]_QBT__Plane_Intersections\.tex$/);
    expect(pi.solnPath).toMatch(/soln[/\\]_QBT___Solns__Plane_Intersections\.tex$/);
    expect(normalizePath(pi.topicDir)).toMatch(/public\/tex\/fm\/core-pure\/vectors$/);
  });

  it('reports unpaired qbt files (no matching soln)', () => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });
    fixture({
      'public/tex/fm/topic/qbt/_QBT__Lonely.tex': '',
    });
    const { pairs, unpaired } = findPackPairs(join(tmpRoot, 'public/tex/fm'), tmpRoot);
    expect(pairs).toEqual([]);
    expect(unpaired).toHaveLength(1);
    expect(unpaired[0].kind).toBe('qbt');
  });

  it('reports unpaired soln files (no matching qbt)', () => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });
    fixture({
      'public/tex/fm/topic/soln/_QBT___Solns__Orphan.tex': '',
    });
    const { pairs, unpaired } = findPackPairs(join(tmpRoot, 'public/tex/fm'), tmpRoot);
    expect(pairs).toEqual([]);
    expect(unpaired).toHaveLength(1);
    expect(unpaired[0].kind).toBe('soln');
  });

  it('ignores notes/ files', () => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });
    fixture({
      'public/tex/fm/topic/qbt/_QBT__T.tex': '',
      'public/tex/fm/topic/soln/_QBT___Solns__T.tex': '',
      'public/tex/fm/topic/notes/_Notes__T.tex': '',
    });
    const { pairs, unpaired } = findPackPairs(join(tmpRoot, 'public/tex/fm'), tmpRoot);
    expect(pairs).toHaveLength(1);
    expect(unpaired).toEqual([]);
  });

  it('does not pair across different topic directories', () => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });
    fixture({
      'public/tex/fm/topic-a/qbt/_QBT__T.tex': '',
      'public/tex/fm/topic-b/soln/_QBT___Solns__T.tex': '',
    });
    const { pairs, unpaired } = findPackPairs(join(tmpRoot, 'public/tex/fm'), tmpRoot);
    expect(pairs).toEqual([]);
    expect(unpaired).toHaveLength(2);
  });
});
