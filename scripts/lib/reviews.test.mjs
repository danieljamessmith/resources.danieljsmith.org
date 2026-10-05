import { describe, it, expect } from 'vitest';
import {
  isoDate,
  isValidIsoDate,
  parseReviews,
  renderReviews,
  resolvePackTex,
  reviewStatuses,
  texPairHash,
} from './reviews.mjs';

/** @returns {import('./resources-derive.mjs').ResourceEntry[]} */
function entries() {
  return [
    {
      id: 'fm-a',
      file: '/tex/further-maths/core-pure/t/qbt/_QBT__A.pdf',
      category: 'FM - Core Pure',
      type: 'questions',
      pairId: 'fm-a-solns',
    },
    {
      id: 'fm-a-solns',
      file: '/tex/further-maths/core-pure/t/soln/_QBT___Solns__A.pdf',
      category: 'FM - Core Pure',
      type: 'solutions',
      pairId: 'fm-a',
    },
    {
      id: 'fm-b',
      file: '/tex/further-maths/core-pure/t/qbt/_QBT__B.pdf',
      category: 'FM - Core Pure',
      type: 'questions',
      pairId: 'fm-b-solns',
    },
    {
      id: 'fm-b-solns',
      file: '/tex/further-maths/core-pure/t/soln/_QBT___Solns__B.pdf',
      category: 'FM - Core Pure',
      type: 'solutions',
      pairId: 'fm-b',
    },
    {
      id: 'tmua-solns',
      file: '/tex/tmua/Paper1_Solutions.pdf',
      category: 'TMUA',
      type: 'solutions',
      pairId: 'tmua',
    },
    { id: 'tmua', file: '/tex/tmua/Paper1.pdf', category: 'TMUA', type: 'questions' },
  ];
}

describe('texPairHash', () => {
  it('is 8 hex chars and ignores CRLF vs LF', () => {
    const lf = texPairHash('a\nb\n', 'c\n');
    expect(lf).toMatch(/^[0-9a-f]{8}$/);
    expect(texPairHash('a\r\nb\r\n', 'c\r\n')).toBe(lf);
  });

  it('changes when either file changes, and depends on which file is which', () => {
    const base = texPairHash('q', 's');
    expect(texPairHash('q2', 's')).not.toBe(base);
    expect(texPairHash('q', 's2')).not.toBe(base);
    expect(texPairHash('s', 'q')).not.toBe(base);
  });

  it('ignores standalone last-updated metadata without hiding content changes', () => {
    const q = '\\djsQbtHeader{T}\n\\begin{document}\nQuestion\n';
    const s = '\\djsSolnHeader{T}\n\\begin{document}\nSolution\n';
    const addDate = (text, day) => text.replace('\\begin{document}', `\\djsLastUpdated{${day} October 2026}\n\\begin{document}`);
    const baseline = texPairHash(q, s);
    expect(texPairHash(addDate(q, 1), addDate(s, 5))).toBe(baseline);
    expect(texPairHash(addDate(q, 5).replace('Question', 'Edited question'), s)).not.toBe(baseline);
    expect(texPairHash(q, addDate(s, 5).replace('Solution\n', 'Edited solution\n'))).not.toBe(baseline);
    expect(texPairHash(`\\djsLastUpdated{5 October 2026}\\newcommand{\\x}{1}\n${q}`, s)).not.toBe(baseline);
  });
});

describe('resolvePackTex', () => {
  it('maps a solutions id to its .tex pair', () => {
    expect(resolvePackTex(entries(), 'fm-a-solns')).toEqual({
      ok: true,
      qbtTex: '/tex/further-maths/core-pure/t/qbt/_QBT__A.tex',
      solnTex: '/tex/further-maths/core-pure/t/soln/_QBT___Solns__A.tex',
    });
  });

  it('rejects unknown ids, questions entries and unpaired entries', () => {
    const es = entries();
    es.push({ id: 'lonely', file: '/tex/x/soln/L.pdf', category: 'X', type: 'solutions' });
    expect(resolvePackTex(es, 'nope').ok).toBe(false);
    expect(resolvePackTex(es, 'fm-a').ok).toBe(false);
    expect(resolvePackTex(es, 'lonely').ok).toBe(false);
  });
});

describe('reviewStatuses', () => {
  const hashes = { 'fm-a-solns': 'aaaaaaaa', 'fm-b-solns': 'bbbbbbbb', 'tmua-solns': 'cccccccc' };
  const currentHash = (/** @type {string} */ id) => hashes[id] ?? null;

  it('sorts packs into current, changed and never within the scope', () => {
    const reviews = {
      'fm-a-solns': { checked: '2026-10-05', texHash: 'aaaaaaaa' },
      'fm-b-solns': { checked: '2026-09-01', texHash: 'old00000' },
    };
    const { packs, unknownIds } = reviewStatuses(
      entries(),
      reviews,
      currentHash,
      '/tex/further-maths/',
    );
    expect(packs).toEqual([
      { id: 'fm-a-solns', status: 'current', checked: '2026-10-05' },
      { id: 'fm-b-solns', status: 'changed', checked: '2026-09-01' },
    ]);
    expect(unknownIds).toEqual([]);
  });

  it('includes other scopes under /tex/ and skips packs whose .tex cannot be read', () => {
    const { packs } = reviewStatuses(
      entries(),
      {},
      (id) => (id === 'fm-b-solns' ? null : currentHash(id)),
      '/tex/',
    );
    expect(packs.map((p) => [p.id, p.status])).toEqual([
      ['fm-a-solns', 'never'],
      ['tmua-solns', 'never'],
    ]);
  });

  it('reports record keys that match no solutions entry', () => {
    const reviews = {
      'fm-a': { checked: '2026-10-05', texHash: 'x' },
      gone: { checked: '2026-10-05', texHash: 'y' },
    };
    const { unknownIds } = reviewStatuses(entries(), reviews, currentHash, '/tex/');
    expect(unknownIds).toEqual(['fm-a', 'gone']);
  });
});

describe('parseReviews / renderReviews', () => {
  it('treats empty input as an empty record and rejects non-objects', () => {
    expect(parseReviews('')).toEqual({});
    expect(() => parseReviews('[]')).toThrow();
    expect(() => parseReviews('null')).toThrow();
  });

  it('renders ids sorted with a trailing newline, and round-trips', () => {
    const reviews = {
      'z-solns': { checked: '2026-10-05', texHash: '11111111' },
      'a-solns': { checked: '2026-10-04', texHash: '22222222' },
    };
    const text = renderReviews(reviews);
    expect(text.indexOf('a-solns')).toBeLessThan(text.indexOf('z-solns'));
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseReviews(text)).toEqual(reviews);
  });
});

describe('isoDate / isValidIsoDate', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(isoDate(new Date(2026, 9, 5))).toBe('2026-10-05');
  });

  it('accepts real dates only', () => {
    expect(isValidIsoDate('2026-10-05')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-1-5')).toBe(false);
    expect(isValidIsoDate('today')).toBe(false);
  });
});
