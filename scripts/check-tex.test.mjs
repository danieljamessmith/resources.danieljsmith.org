import { describe, it, expect } from 'vitest';
import { isUnexpectedFullLineComment } from './check-tex.mjs';

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

  it('returns false for a line with an inline comment after content', () => {
    expect(isUnexpectedFullLineComment('\\item foo % inline comment')).toBe(false);
  });
});
