import { describe, it, expect } from 'vitest';
import {
  parseResourcesEntries,
  derivePathContext,
  deriveTopicId,
  slugify,
  deriveTopicSlugTitle,
  parseStrands,
  sitePathLabels,
  catalogueIdKeys,
  parseBoardLists,
  findStrandTopic,
  markSchemeId,
  markSchemeFile,
  maskStringsAndComments,
  findMatchingClose,
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

describe('parseResourcesEntries mark schemes', () => {
  it("reads a mark scheme row's type, paperId and description", () => {
    const fixture = `
const rawResources: Resource[] = [
  {
    id: 'fm-polar-curves-ms',
    title: 'Polar Curves',
    description: 'Mark scheme',
    file: '/tex/further-maths/core-pure/polar/ms/_QBT___MS__Polar_Curves.pdf',
    category: FM_CP,
    type: 'markscheme',
    paperId: 'fm-polar-curves',
    topic: 'Polar Coordinates',
  },
];
`;
    const [e] = parseResourcesEntries(fixture);
    expect(e.type).toBe('markscheme');
    expect(e.paperId).toBe('fm-polar-curves');
    expect(e.description).toBe('Mark scheme');
  });
});

describe('markSchemeId and markSchemeFile', () => {
  it('swaps -solns for -ms', () => {
    expect(markSchemeId('fm-polar-integration-polar-curves-solns')).toBe('fm-polar-integration-polar-curves-ms');
    expect(markSchemeId('fm-polar-curves')).toBeNull();
  });

  it("puts the scheme in the ms folder beside the pack's qbt folder", () => {
    expect(markSchemeFile('/tex/further-maths/core-pure/polar/qbt/_QBT__Polar_Curves.pdf')).toBe(
      '/tex/further-maths/core-pure/polar/ms/_QBT___MS__Polar_Curves.pdf',
    );
    expect(markSchemeFile('/tex/further-maths/core-pure/polar/soln/_QBT___Solns__Polar_Curves.pdf')).toBeNull();
    expect(markSchemeFile('/tex/tmua/TMUA_SetA_Paper1.pdf')).toBeNull();
  });
});

/** A questions row and its solutions row, as `parseResourcesEntries` returns them. */
function packPair(id, folder, topic, category = 'FM - Core Pure') {
  return [
    { id, file: `/tex/further-maths/${folder}/qbt/_QBT__X.pdf`, category, topic, type: 'questions' },
    { id: `${id}-solns`, file: `/tex/further-maths/${folder}/soln/_QBT___Solns__X.pdf`, category, topic, type: 'solutions' },
  ];
}

describe('derivePathContext', () => {
  it("derives category, topic, id prefix and sibling from the folder's packs", () => {
    const entries = [
      { id: 'fm-vectors-formulae-notes', file: '/tex/further-maths/core-pure/vectors/notes/N.pdf', category: 'FM - Core Pure', topic: 'Vectors', type: 'notes' },
      ...packPair('fm-vectors-matrix-determinants', 'core-pure/vectors', 'Vectors'),
      ...packPair('fm-vectors-vector-product', 'core-pure/vectors', 'Vectors'),
    ];
    const ctx = derivePathContext('further-maths/core-pure/vectors', entries);
    expect(ctx.category).toBe('FM - Core Pure');
    expect(ctx.topic).toBe('Vectors');
    expect(ctx.idPrefix).toBe('fm-vectors-');
    expect(ctx.siblingId).toBe('fm-vectors-vector-product-solns');
    expect(ctx.fromSiblings).toBe(true);
  });

  it("puts a new pack after the last pack's mark scheme, not between it and its solutions", () => {
    const entries = [
      ...packPair('fm-vectors-matrix-determinants', 'core-pure/vectors', 'Vectors'),
      ...packPair('fm-vectors-vector-product', 'core-pure/vectors', 'Vectors'),
      { id: 'fm-vectors-vector-product-ms', file: '/tex/further-maths/core-pure/vectors/ms/_QBT___MS__X.pdf', category: 'FM - Core Pure', topic: 'Vectors', type: 'markscheme', paperId: 'fm-vectors-vector-product' },
    ];
    const ctx = derivePathContext('further-maths/core-pure/vectors', entries);
    expect(ctx.siblingId).toBe('fm-vectors-vector-product-ms');
    expect(ctx.idPrefix).toBe('fm-vectors-');
  });

  it("stops a one-pack folder's id prefix at the section, not inside the pack's slug", () => {
    const entries = packPair(
      'further-maths-further-mechanics-kinematics-dynamics-motion-under-a-variable-force',
      'further-mechanics/kinematics-dynamics',
      'Kinematics & Dynamics',
      'FM - Further Mechanics',
    );
    const ctx = derivePathContext('further-maths/further-mechanics/kinematics-dynamics', entries);
    expect(ctx.idPrefix).toBe('further-maths-further-mechanics-kinematics-dynamics-');
  });

  it('cuts the prefix back to the section when its packs share opening words', () => {
    const folder = 'further-mechanics/centre-of-mass';
    const base = 'further-maths-further-mechanics-centre-of-mass-';
    const entries = [
      ...packPair(`${base}centre-of-mass-of-systems-of-particles`, folder, 'Centre of Mass', 'FM - Further Mechanics'),
      ...packPair(`${base}centre-of-mass-of-polygonal-laminae`, folder, 'Centre of Mass', 'FM - Further Mechanics'),
    ];
    expect(derivePathContext(`further-maths/${folder}`, entries).idPrefix).toBe(base);

    const wep = 'further-mechanics/work-energy-power';
    const wepBase = 'further-maths-further-mechanics-work-energy-power-';
    const wepEntries = [
      ...packPair(`${wepBase}work-energy-principle`, wep, 'Work, Energy and Power', 'FM - Further Mechanics'),
      ...packPair(`${wepBase}work-energy-elastic-potential-energy`, wep, 'Work, Energy and Power', 'FM - Further Mechanics'),
    ];
    expect(derivePathContext(`further-maths/${wep}`, wepEntries).idPrefix).toBe(wepBase);
  });

  it("keeps a shared prefix that doesn't name the section", () => {
    const entries = [
      ...packPair('fm-further-integration-by-parts', 'core-pure/further-calculus', 'Further Calculus'),
      ...packPair('fm-further-maclaurin-series', 'core-pure/further-calculus', 'Further Calculus'),
    ];
    expect(derivePathContext('further-maths/core-pure/further-calculus', entries).idPrefix).toBe('fm-further-');
  });

  it('falls back when there are no siblings, with no section to name', () => {
    const ctx = derivePathContext('further-maths/core-pure/new-topic', []);
    expect(ctx.fromSiblings).toBe(false);
    expect(ctx.category).toBe('FM - Core Pure');
    expect(ctx.topic).toBeUndefined();
    expect(ctx.siblingId).toBeNull();
  });
});

describe('parseResourcesEntries boards', () => {
  it("reads a row's boards, undefined when it has none", () => {
    const fixture = `
const rawResources: Resource[] = [
  {
    id: 'fm-a',
    title: 'A',
    file: '/tex/further-maths/further-mechanics/m/qbt/_QBT__A.pdf',
    category: FM_MECH,
    type: 'questions',
    boards: ['edexcel-fm2', 'aqa'],
  },
  {
    id: 'fm-a-solns',
    title: 'A',
    file: '/tex/further-maths/further-mechanics/m/soln/_QBT___Solns__A.pdf',
    category: FM_MECH,
    type: 'solutions',
  },
];
`;
    expect(parseResourcesEntries(fixture).map((e) => e.boards)).toEqual([['edexcel-fm2', 'aqa'], undefined]);
  });
});

describe('catalogueIdKeys', () => {
  it('finds every row id, in either quote style, but not ids in comments or strings', () => {
    const fixture = `
const rawResources: Resource[] = [
  // id: 'commented-out'
  {
    id: 'fm-a',
    title: 'Grid id: not a key',
    file: '/tex/a.pdf',
    category: FM_CP,
    pairId: 'fm-b',
  },
  {
    id: "fm-b",
    title: 'B',
    file: '/tex/b.pdf',
    category: FM_CP,
  },
];
const other = [{ id: 'not-a-row' }];
`;
    expect(catalogueIdKeys(fixture)).toEqual([
      { id: 'fm-a', line: 5 },
      { id: 'fm-b', line: 12 },
    ]);
    // The regex parser drops the double-quoted row, which is what the check catches.
    expect(parseResourcesEntries(fixture).map((e) => e.id)).toEqual(['fm-a']);
  });
});

describe('parseBoardLists', () => {
  it('reads each exported board list by name', () => {
    const fixture = `
export const EXAM_BOARDS: { id: ExamBoard; label: string }[] = [
  { id: 'edexcel', label: 'Edexcel' },
  { id: 'aqa', label: 'AQA' },
];

export const FM_MECH_EXAM_BOARDS: { id: ExamBoard; label: string }[] = [
  { id: 'edexcel-fm1', label: 'Edexcel FM1' },
];
`;
    expect([...parseBoardLists(fixture)]).toEqual([
      ['EXAM_BOARDS', ['edexcel', 'aqa']],
      ['FM_MECH_EXAM_BOARDS', ['edexcel-fm1']],
    ]);
  });
});

describe('maskStringsAndComments / findMatchingClose', () => {
  it('blanks strings and comments but keeps their positions', () => {
    const src = "a = ['x]', /* ] */ 1] // ]\nb";
    const masked = maskStringsAndComments(src);
    expect(masked).toHaveLength(src.length);
    expect(masked.split('\n')).toHaveLength(2);
    expect(masked).not.toMatch(/x|\*/);
    expect(findMatchingClose(src, src.indexOf('['))).toBe(src.indexOf('1]') + 1);
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

  it("reads each strand's folder and resolves its board list", () => {
    const fixture = TOPICS_FIXTURE.replace(
      "href: '/further-maths/core-pure/',",
      "href: '/further-maths/core-pure/',\n    boards: EXAM_BOARDS,",
    );
    const strands = parseStrands(fixture, new Map([['EXAM_BOARDS', ['edexcel', 'aqa']]]));
    expect(strands.map((s) => [s.folder, s.boardsConst, s.boards])).toEqual([
      ['core-pure', 'EXAM_BOARDS', ['edexcel', 'aqa']],
      ['further-mechanics', undefined, undefined],
    ]);
  });
});

describe('findStrandTopic', () => {
  const [corePure] = parseStrands(TOPICS_FIXTURE);

  it('finds a section by its topic or its heading', () => {
    expect(findStrandTopic(corePure, 'Vectors')?.id).toBe('vectors');
    expect(findStrandTopic(corePure, ' Vectors, Matrices & Linear Transformations ')?.id).toBe('vectors');
    expect(findStrandTopic(corePure, 'vectors')).toBeUndefined();
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
