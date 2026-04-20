import { describe, it, expect } from 'vitest';
import {
  parseResourcesEntries,
  derivePathContext,
  deriveTopicId,
  slugify,
  deriveTopicSlugTitle,
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
