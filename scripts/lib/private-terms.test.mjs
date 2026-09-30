import { describe, it, expect } from 'vitest';
import { parseTermList, findTermHits, looksBinary } from './private-terms.mjs';

describe('parseTermList', () => {
  it('reads one term per line, skipping comments and blanks', () => {
    expect(parseTermList('# note\nalpha\n\n  beta  \r\n# gamma\n')).toEqual(['alpha', 'beta']);
  });

  it('also splits comma-separated entries', () => {
    expect(parseTermList('alpha, beta,,gamma')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns an empty list for empty input', () => {
    expect(parseTermList('')).toEqual([]);
  });
});

describe('findTermHits', () => {
  it('matches case-insensitively as substrings and reports term numbers', () => {
    const text = 'clean line\nsee Foo-Bar here\nfoo-bar and BAZ\n';
    expect(findTermHits(text, ['foo-bar', 'baz'])).toEqual([
      { line: 2, termNo: 1 },
      { line: 3, termNo: 1 },
      { line: 3, termNo: 2 },
    ]);
  });

  it('ignores terms embedded in longer alphanumeric runs', () => {
    expect(findTermHits('sha512-x9Fooq2 and prefoo', ['foo'])).toEqual([]);
  });

  it('treats punctuation and underscores as token boundaries', () => {
    expect(findTermHits('a foo-generated file', ['foo'])).toEqual([{ line: 1, termNo: 1 }]);
    expect(findTermHits('x_foo_y.py', ['foo'])).toEqual([{ line: 1, termNo: 1 }]);
  });

  it('escapes regex metacharacters in terms', () => {
    expect(findTermHits('call make.pack now', ['make.pack'])).toEqual([{ line: 1, termNo: 1 }]);
    expect(findTermHits('call makeXpack now', ['make.pack'])).toEqual([]);
  });

  it('handles CRLF and returns nothing for clean text', () => {
    expect(findTermHits('a\r\nb\r\n', ['zzz'])).toEqual([]);
  });

  it('reports a term once per line even if repeated', () => {
    expect(findTermHits('foo foo foo', ['foo'])).toEqual([{ line: 1, termNo: 1 }]);
  });
});

describe('looksBinary', () => {
  it('detects a NUL byte', () => {
    expect(looksBinary(new Uint8Array([37, 80, 0, 68]))).toBe(true);
  });

  it('treats plain text as non-binary', () => {
    expect(looksBinary(new TextEncoder().encode('hello\nworld'))).toBe(false);
  });
});
