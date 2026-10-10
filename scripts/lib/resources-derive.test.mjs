import { describe, it, expect } from 'vitest';
import {
  parseResourcesEntries,
  derivePathContext,
  deriveTopicId,
  slugify,
  deriveTopicSlugTitle,
  parseStrands,
  sitePathLabels,
} from './resources-derive.mjs';

const FIXTURE = `
const rawResources: Resource[] = [
  {
    id: 'fm-vectors-vector-product-solns',
    title: 'Vector Product',
    file: '/tex/further-maths/core-pure/vectors/soln/_QBT___Solns__Vector_Product.pdf',
    category: FM_CP,
    type: 'solutions',
    pairId: 'fm-vectors-vector-product',
    topic: 'Vectors',
  },
];
`;

describe('parseResourcesEntries', () => {
  it('parses id, file, category, topic from a fixture', () => {
    const entries = parseResourcesEntries(FIXTURE);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const e = entries[0];
    expect(e.id).toBe('fm-vectors-vector-product-solns');
    expect(e.file).toContain('/tex/further-maths/core-pure/vectors/');
    expect(e.category).toBe('FM - Core Pure');
    expect(e.topic).toBe('Vectors');
  });

  it('exposes pairId when present, undefined otherwise', () => {
    const fixture = `
const rawResources: Resource[] = [
  {
    id: 'fm-foo-questions',
    title: 'Foo',
    file: '/tex/further-maths/core-pure/foo/qbt/_QBT__Foo.pdf',
    category: FM_CP,
    type: 'questions',
    pairId: 'fm-foo-solns',
    topic: 'Foo',
  },
  {
    id: 'tmua-paper1',
    title: 'TMUA',
    file: '/tex/tmua/TMUA_Paper1.pdf',
    category: 'TMUA',
  },
];
`;
    const entries = parseResourcesEntries(fixture);
    expect(entries).toHaveLength(2);
    expect(entries[0].pairId).toBe('fm-foo-solns');
    expect(entries[0].type).toBe('questions');
    expect(entries[1].pairId).toBeUndefined();
    expect(entries[1].type).toBeUndefined();
  });

  it('exposes paperId on an answer key, undefined otherwise', () => {
    const fixture = `
const rawResources: Resource[] = [
  {
    id: 'tmua-setA-paper1',
    title: 'TMUA Set A Paper 1',
    file: '/tex/tmua/TMUA_SetA_Paper1.pdf',
    category: 'TMUA',
    type: 'questions',
  },
  {
    id: 'tmua-setA-paper1-answers',
    title: 'TMUA Set A Paper 1',
    file: '/tex/tmua/TMUA_SetA_Paper1_Answers.pdf',
    category: 'TMUA',
    type: 'answers',
    paperId: 'tmua-setA-paper1',
  },
];
`;
    const entries = parseResourcesEntries(fixture);
    expect(entries).toHaveLength(2);
    expect(entries[0].paperId).toBeUndefined();
    expect(entries[1].type).toBe('answers');
    expect(entries[1].paperId).toBe('tmua-setA-paper1');
  });
});

describe('derivePathContext', () => {
  it('derives category, topic, id prefix, and sibling from siblings', () => {
    const entries = parseResourcesEntries(FIXTURE);
    const ctx = derivePathContext('further-maths/core-pure/vectors', entries);
    expect(ctx.category).toBe('FM - Core Pure');
    expect(ctx.topic).toBe('Vectors');
    expect(ctx.idPrefix).toContain('fm-vectors');
    expect(ctx.siblingId).toBe('fm-vectors-vector-product-solns');
    expect(ctx.fromSiblings).toBe(true);
  });

  it('falls back when there are no siblings', () => {
    const ctx = derivePathContext('further-maths/core-pure/new-topic', []);
    expect(ctx.fromSiblings).toBe(false);
    expect(ctx.category).toBe('FM - Core Pure');
    expect(ctx.siblingId).toBeNull();
  });
});

describe('slugify / deriveTopicId / deriveTopicSlugTitle', () => {
  it('slugifies a topic title', () => {
    expect(slugify('Matrix Determinants & Inverses')).toBe('matrix-determinants-inverses');
  });

  it('builds topic id from prefix + slug', () => {
    expect(deriveTopicId('fm-vectors-', 'Matrix Determinants & Inverses')).toBe(
      'fm-vectors-matrix-determinants-inverses',
    );
  });

  it('title-cases a slug', () => {
    expect(deriveTopicSlugTitle('core-pure')).toBe('Core Pure');
  });
});

describe('parseResourcesEntries titles', () => {
  it('reads single- and double-quoted titles, unescaping quotes', () => {
    const fixture = `
const rawResources: Resource[] = [
  {
    id: 'fm-a',
    title: 'Matrix Determinants & Inverses',
    file: '/tex/further-maths/core-pure/vectors/qbt/_QBT__A.pdf',
    category: FM_CP,
  },
  {
    id: 'fm-b',
    title: "De Moivre's Theorem",
    file: '/tex/further-maths/core-pure/complex-numbers/qbt/_QBT__B.pdf',
    category: FM_CP,
  },
  {
    id: 'fm-c',
    title: 'Newton\\'s Laws',
    file: '/tex/further-maths/further-mechanics/m/qbt/_QBT__C.pdf',
    category: FM_MECH,
  },
];
`;
    expect(parseResourcesEntries(fixture).map((e) => e.title)).toEqual([
      'Matrix Determinants & Inverses',
      "De Moivre's Theorem",
      "Newton's Laws",
    ]);
  });
});

const TOPICS_FIXTURE = `
export const STRANDS: Strand[] = [
  {
    category: FM_CP,
    title: 'Core Pure',
    href: '/further-maths/core-pure/',
    topics: [
      { id: 'further-calculus', topic: 'Further Calculus', title: 'Further Calculus', navLabel: 'Further Calculus' },
      { id: 'vectors', topic: 'Vectors', title: 'Vectors, Matrices & Linear Transformations', navLabel: 'Vectors & Matrices' },
    ],
  },
  {
    category: FM_MECH,
    title: 'Further Mechanics',
    href: '/further-maths/further-mechanics/',
    topics: [
      { id: 'centre-of-mass', topic: 'Centre of Mass', title: 'Centre of Mass', navLabel: 'Centre of Mass' },
    ],
  },
];
`;

describe('parseStrands', () => {
  it('reads each strand with its topics', () => {
    const strands = parseStrands(TOPICS_FIXTURE);
    expect(strands.map((s) => [s.category, s.title, s.topics.length])).toEqual([
      ['FM - Core Pure', 'Core Pure', 2],
      ['FM - Further Mechanics', 'Further Mechanics', 1],
    ]);
    expect(strands[0].topics[1]).toEqual({
      id: 'vectors',
      topic: 'Vectors',
      title: 'Vectors, Matrices & Linear Transformations',
    });
  });

  it('returns nothing without a STRANDS array', () => {
    expect(parseStrands('export const OTHER = [];')).toEqual([]);
  });
});

describe('sitePathLabels', () => {
  const strands = parseStrands(TOPICS_FIXTURE);

  it('names the strand title and the topic section heading', () => {
    expect(sitePathLabels(strands, 'FM - Core Pure', 'Vectors')).toEqual({
      strand: 'Core Pure',
      section: 'Vectors, Matrices & Linear Transformations',
    });
  });

  it('keeps a topic not yet listed in topics.ts', () => {
    expect(sitePathLabels(strands, 'FM - Further Mechanics', 'Circular Motion')).toEqual({
      strand: 'Further Mechanics',
      section: 'Circular Motion',
    });
  });

  it('returns null outside the strands or without a topic', () => {
    expect(sitePathLabels(strands, 'TMUA', 'Paper 1')).toBeNull();
    expect(sitePathLabels(strands, 'FM - Core Pure', undefined)).toBeNull();
  });
});
