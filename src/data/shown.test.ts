import { describe, expect, it } from 'vitest';
import { hiddenStrandHrefs, shownStrands, shownTopics } from './shown';

/** Three strands: two with packs, one (the last) with none yet. */
const STRANDS = [
  {
    category: 'FM - One',
    href: '/further-maths/one/',
    topics: [
      { id: 'a', topic: 'A' },
      { id: 'b', topic: 'B' },
    ],
  },
  { category: 'FM - Two', href: '/further-maths/two/', topics: [{ id: 'c', topic: 'C' }] },
  {
    category: 'FM - Three',
    href: '/further-maths/three/',
    topics: [
      { id: 'a', topic: 'A' },
      { id: 'd', topic: 'D' },
    ],
  },
];

const ROWS = [
  { category: 'TMUA' },
  { category: 'FM - One', topic: 'A' },
  { category: 'FM - One', topic: 'A' },
  { category: 'FM - Two', topic: 'C' },
];

describe('shownStrands', () => {
  it('keeps the strands with a row, in catalogue order, and leaves an empty one off', () => {
    expect(shownStrands(STRANDS, ROWS).map((s) => s.category)).toEqual(['FM - One', 'FM - Two']);
  });

  it('shows a strand once it has a row', () => {
    const rows = [...ROWS, { category: 'FM - Three', topic: 'D' }];
    expect(shownStrands(STRANDS, rows).map((s) => s.category)).toEqual(['FM - One', 'FM - Two', 'FM - Three']);
  });
});

describe('shownTopics', () => {
  it("keeps a strand's sections with a row, in page order", () => {
    expect(shownTopics(STRANDS[0], ROWS).map((t) => t.id)).toEqual(['a']);
    expect(shownTopics(STRANDS[1], ROWS).map((t) => t.id)).toEqual(['c']);
  });

  it("does not count another strand's section of the same topic", () => {
    expect(shownTopics(STRANDS[2], ROWS)).toEqual([]);
    const rows = [...ROWS, { category: 'FM - Three', topic: 'D' }];
    expect(shownTopics(STRANDS[2], rows).map((t) => t.id)).toEqual(['d']);
  });
});

describe('hiddenStrandHrefs', () => {
  it('names the pages of the strands with no row', () => {
    expect(hiddenStrandHrefs(STRANDS, ROWS)).toEqual(['/further-maths/three/']);
    expect(hiddenStrandHrefs(STRANDS, [...ROWS, { category: 'FM - Three', topic: 'A' }])).toEqual([]);
  });
});
