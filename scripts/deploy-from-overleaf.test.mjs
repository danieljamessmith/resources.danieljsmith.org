import { describe, it, expect } from 'vitest';
import {
  parseProjectId,
  parseBoardSelection,
  sanitizeTopic,
  formatBoardsSnippet,
} from './deploy-from-overleaf.mjs';

// ---------------------------------------------------------------------------
// parseProjectId
// ---------------------------------------------------------------------------

describe('parseProjectId', () => {
  it('accepts a bare hex ID', () => {
    expect(parseProjectId('abc123def456')).toBe('abc123def456');
  });

  it('extracts the ID from a full Overleaf URL', () => {
    expect(parseProjectId('https://www.overleaf.com/project/abc123def456')).toBe('abc123def456');
  });

  it('trims whitespace before parsing', () => {
    expect(parseProjectId('  abc123def456  ')).toBe('abc123def456');
  });

  it('returns null for an invalid input', () => {
    expect(parseProjectId('not-a-valid-id')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseProjectId('')).toBeNull();
  });

  it('is case-insensitive for hex characters', () => {
    expect(parseProjectId('ABC123DEF456')).toBe('ABC123DEF456');
  });
});

// ---------------------------------------------------------------------------
// parseBoardSelection
// ---------------------------------------------------------------------------

describe('parseBoardSelection', () => {
  it('returns null boardIds for empty input (all boards)', () => {
    expect(parseBoardSelection('')).toEqual({ ok: true, boardIds: null });
    expect(parseBoardSelection('   ')).toEqual({ ok: true, boardIds: null });
  });

  it('returns null boardIds when option 1 is selected alone', () => {
    expect(parseBoardSelection('1')).toEqual({ ok: true, boardIds: null });
  });

  it('returns the correct board ID for a single selection', () => {
    expect(parseBoardSelection('2')).toEqual({ ok: true, boardIds: ['edexcel'] });
    expect(parseBoardSelection('3')).toEqual({ ok: true, boardIds: ['aqa'] });
    expect(parseBoardSelection('4')).toEqual({ ok: true, boardIds: ['ocr-a'] });
    expect(parseBoardSelection('5')).toEqual({ ok: true, boardIds: ['ocr-mei'] });
    expect(parseBoardSelection('6')).toEqual({ ok: true, boardIds: ['cie'] });
  });

  it('returns multiple board IDs for a comma-separated selection', () => {
    const result = parseBoardSelection('2,3');
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'aqa'] });
  });

  it('deduplicates repeated selections', () => {
    const result = parseBoardSelection('2,2,3');
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'aqa'] });
  });

  it('accepts space-separated input', () => {
    const result = parseBoardSelection('2 4');
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'ocr-a'] });
  });

  it('returns an error when option 1 is combined with others', () => {
    const result = parseBoardSelection('1,2');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cannot be combined/i);
  });

  it('returns an error for an out-of-range number', () => {
    const result = parseBoardSelection('7');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/between 1 and 6/i);
  });

  it('returns an error for non-numeric input', () => {
    const result = parseBoardSelection('abc');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeTopic
// ---------------------------------------------------------------------------

describe('sanitizeTopic', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeTopic('Matrix Determinants')).toBe('Matrix_Determinants');
  });

  it('replaces non-alphanumeric characters', () => {
    expect(sanitizeTopic('Complex Numbers & Geometry')).toBe(
      'Complex_Numbers___Geometry',
    );
  });

  it('leaves alphanumeric characters untouched', () => {
    expect(sanitizeTopic('VectorsABC123')).toBe('VectorsABC123');
  });

  it('handles an already-clean string', () => {
    expect(sanitizeTopic('Matrices')).toBe('Matrices');
  });
});

// ---------------------------------------------------------------------------
// formatBoardsSnippet
// ---------------------------------------------------------------------------

describe('formatBoardsSnippet', () => {
  it('returns the "omit boards" message for null', () => {
    const result = formatBoardsSnippet(null);
    expect(result).toContain('omit');
    expect(result).toContain('boards');
  });

  it('returns the "omit boards" message for an empty array', () => {
    const result = formatBoardsSnippet([]);
    expect(result).toContain('omit');
  });

  it('formats a single board correctly', () => {
    const result = formatBoardsSnippet(['edexcel']);
    expect(result).toContain("'edexcel'");
    expect(result).toContain('boards:');
  });

  it('formats multiple boards correctly', () => {
    const result = formatBoardsSnippet(['edexcel', 'aqa']);
    expect(result).toContain("'edexcel'");
    expect(result).toContain("'aqa'");
  });
});
