import { describe, it, expect } from 'vitest';
import {
  insertPackRows,
  renderPackRows,
  rowRanges,
  solutionsId,
  tsTitle,
  verifyPackRows,
} from './resources-write.mjs';
import { parseResourcesEntries } from './resources-derive.mjs';

const CATALOGUE = `const rawResources: Resource[] = [
  // --- TMUA ---
  {
    id: 'tmua-a',
    title: 'TMUA A',
    description: '',
    file: '/tex/tmua/TMUA_A.pdf',
    category: 'TMUA',
    type: 'questions',
  },

  // --- A-level Further Maths: Polar Coordinates ---
  {
    id: 'fm-polar-a',
    title: 'Polar A',
    description: '',
    file: '/tex/further-maths/core-pure/polar-coordinates/qbt/_QBT__Polar_A.pdf',
    category: FM_CP,
    type: 'questions',
    pairId: 'fm-polar-a-solns',
    topic: 'Polar Coordinates',
  },
  {
    id: 'fm-polar-a-solns',
    title: 'Polar A',
    description: 'Full worked solutions',
    file: '/tex/further-maths/core-pure/polar-coordinates/soln/_QBT___Solns__Polar_A.pdf',
    category: FM_CP,
    type: 'solutions',
    pairId: 'fm-polar-a',
    topic: 'Polar Coordinates',
  },

  // --- A-level Further Maths: Proof by Induction ---
  {
    id: 'fm-induction-a',
    title: 'Induction A',
    description: '',
    file: '/tex/further-maths/core-pure/induction/qbt/_QBT__Induction_A.pdf',
    category: FM_CP,
    type: 'questions',
    pairId: 'fm-induction-a-solns',
    topic: 'Proof by Induction',
  },
  {
    id: 'fm-induction-a-solns',
    title: 'Induction A',
    description: 'Full worked solutions',
    file: '/tex/further-maths/core-pure/induction/soln/_QBT___Solns__Induction_A.pdf',
    category: FM_CP,
    type: 'solutions',
    pairId: 'fm-induction-a',
    topic: 'Proof by Induction',
  },

  // --- A-level Further Maths: Further Mechanics - Centre of Mass ---
  {
    id: 'fm-mech-com-a',
    title: 'Centre of Mass A',
    description: '',
    file: '/tex/further-maths/further-mechanics/centre-of-mass/qbt/_QBT__Centre_of_Mass_A.pdf',
    category: FM_MECH,
    type: 'questions',
    pairId: 'fm-mech-com-a-solns',
    topic: 'Centre of Mass',
    boards: ['edexcel-fm2', 'aqa'],
  },
  {
    id: 'fm-mech-com-a-solns',
    title: 'Centre of Mass A',
    description: 'Full worked solutions',
    file: '/tex/further-maths/further-mechanics/centre-of-mass/soln/_QBT___Solns__Centre_of_Mass_A.pdf',
    category: FM_MECH,
    type: 'solutions',
    pairId: 'fm-mech-com-a',
    topic: 'Centre of Mass',
  },
];

export const resources = rawResources;
`;

/** @param {Partial<import('./resources-write.mjs').PackRows>} p */
function pack(p = {}) {
  return {
    id: 'fm-polar-b',
    title: 'Polar B',
    category: 'FM - Core Pure',
    topic: 'Polar Coordinates',
    qbtFile: '/tex/further-maths/core-pure/polar-coordinates/qbt/_QBT__Polar_B.pdf',
    solnFile: '/tex/further-maths/core-pure/polar-coordinates/soln/_QBT___Solns__Polar_B.pdf',
    boards: null,
    ...p,
  };
}

const ids = (source) => parseResourcesEntries(source).map((e) => e.id);

describe('renderPackRows', () => {
  it('writes both rows in the catalogue shape, leaving boards out for all boards', () => {
    expect(renderPackRows(pack())).toBe(
      [
        '  {',
        "    id: 'fm-polar-b',",
        "    title: 'Polar B',",
        "    description: '',",
        "    file: '/tex/further-maths/core-pure/polar-coordinates/qbt/_QBT__Polar_B.pdf',",
        '    category: FM_CP,',
        "    type: 'questions',",
        "    pairId: 'fm-polar-b-solns',",
        "    topic: 'Polar Coordinates',",
        '  },',
        '  {',
        "    id: 'fm-polar-b-solns',",
        "    title: 'Polar B',",
        "    description: 'Full worked solutions',",
        "    file: '/tex/further-maths/core-pure/polar-coordinates/soln/_QBT___Solns__Polar_B.pdf',",
        '    category: FM_CP,',
        "    type: 'solutions',",
        "    pairId: 'fm-polar-b',",
        "    topic: 'Polar Coordinates',",
        '  },',
      ].join('\n'),
    );
  });

  it('quotes a title with an apostrophe in double quotes, and one with & as it is', () => {
    expect(tsTitle("De Moivre's Theorem")).toBe('"De Moivre\'s Theorem"');
    expect(tsTitle('Matrix Determinants & Inverses')).toBe("'Matrix Determinants & Inverses'");
  });

  it('adds the mark scheme row after the solutions row, naming its pack by paperId', () => {
    const msFile = '/tex/further-maths/core-pure/polar-coordinates/ms/_QBT___MS__Polar_B.pdf';
    const out = renderPackRows(pack({ msFile, boards: ['aqa'] }));
    expect(out.split('\n').slice(21)).toEqual([
      '  {',
      "    id: 'fm-polar-b-ms',",
      "    title: 'Polar B',",
      "    description: 'Mark scheme',",
      `    file: '${msFile}',`,
      '    category: FM_CP,',
      "    type: 'markscheme',",
      "    paperId: 'fm-polar-b',",
      "    topic: 'Polar Coordinates',",
      '  },',
    ]);
  });

  it('refuses a category without a constant', () => {
    expect(() => renderPackRows(pack({ category: 'TMUA' }))).toThrow(/category constant/);
  });
});

describe('insertPackRows', () => {
  it("puts the rows straight after the section's last pack", () => {
    const out = insertPackRows(CATALOGUE, pack(), { afterId: 'fm-polar-a-solns' });
    expect(ids(out)).toEqual([
      'tmua-a',
      'fm-polar-a',
      'fm-polar-a-solns',
      'fm-polar-b',
      'fm-polar-b-solns',
      'fm-induction-a',
      'fm-induction-a-solns',
      'fm-mech-com-a',
      'fm-mech-com-a-solns',
    ]);
    expect(out).toContain("    topic: 'Polar Coordinates',\n  },\n\n  // --- A-level Further Maths: Proof by Induction ---");
    expect(verifyPackRows(out, pack())).toEqual([]);
  });

  it('writes a title with an apostrophe so it reads back', () => {
    const p = pack({ title: "Bernoulli's Polar Curves" });
    const out = insertPackRows(CATALOGUE, p, { afterId: 'fm-polar-a-solns' });
    expect(out).toContain('    title: "Bernoulli\'s Polar Curves",');
    expect(verifyPackRows(out, p)).toEqual([]);
  });

  it('writes a title with & so it reads back', () => {
    const p = pack({ title: 'Areas & Tangents' });
    const out = insertPackRows(CATALOGUE, p, { afterId: 'fm-polar-a-solns' });
    expect(out).toContain("    title: 'Areas & Tangents',");
    expect(verifyPackRows(out, p)).toEqual([]);
  });

  it('puts Mechanics boards on the questions row only', () => {
    const p = pack({
      id: 'fm-mech-com-b',
      title: 'Centre of Mass B',
      category: 'FM - Further Mechanics',
      topic: 'Centre of Mass',
      qbtFile: '/tex/further-maths/further-mechanics/centre-of-mass/qbt/_QBT__Centre_of_Mass_B.pdf',
      solnFile: '/tex/further-maths/further-mechanics/centre-of-mass/soln/_QBT___Solns__Centre_of_Mass_B.pdf',
      boards: ['edexcel-fm1', 'ocr-mei-mechanics-minor'],
    });
    const out = insertPackRows(CATALOGUE, p, { afterId: 'fm-mech-com-a-solns' });
    const rows = parseResourcesEntries(out).filter((e) => e.id.startsWith('fm-mech-com-b'));
    expect(rows.map((e) => [e.id, e.category, e.boards])).toEqual([
      ['fm-mech-com-b', 'FM - Further Mechanics', ['edexcel-fm1', 'ocr-mei-mechanics-minor']],
      ['fm-mech-com-b-solns', 'FM - Further Mechanics', undefined],
    ]);
    expect(out).toContain("    category: FM_MECH,\n    type: 'questions',");
    expect(out.trimEnd().endsWith("  },\n];\n\nexport const resources = rawResources;")).toBe(true);
    expect(verifyPackRows(out, p)).toEqual([]);
  });

  it("puts a section's first pack after its strand's rows, under a section comment", () => {
    const p = pack({
      id: 'fm-complex-a',
      title: 'Complex A',
      topic: 'Complex Numbers',
      qbtFile: '/tex/further-maths/core-pure/complex-numbers/qbt/_QBT__Complex_A.pdf',
      solnFile: '/tex/further-maths/core-pure/complex-numbers/soln/_QBT___Solns__Complex_A.pdf',
    });
    const out = insertPackRows(CATALOGUE, p, {
      sectionComment: 'A-level Further Maths: Core Pure - Complex Numbers',
    });
    expect(ids(out).slice(4, 8)).toEqual(['fm-induction-a-solns', 'fm-complex-a', 'fm-complex-a-solns', 'fm-mech-com-a']);
    expect(out).toContain(
      "    topic: 'Proof by Induction',\n  },\n\n  // --- A-level Further Maths: Core Pure - Complex Numbers ---\n  {\n    id: 'fm-complex-a',",
    );
    expect(out).toContain("    topic: 'Complex Numbers',\n  },\n\n  // --- A-level Further Maths: Further Mechanics - Centre of Mass ---");
    expect(verifyPackRows(out, p)).toEqual([]);
  });

  it("puts a strand's last section's first pack at the end of the array", () => {
    const p = pack({
      id: 'fm-mech-wep-a',
      title: 'Work A',
      category: 'FM - Further Mechanics',
      topic: 'Work, Energy and Power',
      qbtFile: '/tex/further-maths/further-mechanics/work-energy-power/qbt/_QBT__Work_A.pdf',
      solnFile: '/tex/further-maths/further-mechanics/work-energy-power/soln/_QBT___Solns__Work_A.pdf',
    });
    const out = insertPackRows(CATALOGUE, p, {
      sectionComment: 'A-level Further Maths: Further Mechanics - Work, Energy and Power',
    });
    expect(ids(out).slice(-2)).toEqual(['fm-mech-wep-a', 'fm-mech-wep-a-solns']);
    expect(out).toContain("    topic: 'Work, Energy and Power',\n  },\n];");
  });

  it('keeps CRLF line endings, and adds a comma to a last row without one', () => {
    const crlf = CATALOGUE.replace(
      "    topic: 'Centre of Mass',\n  },\n];",
      "    topic: 'Centre of Mass',\n  }\n];",
    ).replaceAll('\n', '\r\n');
    const p = pack({
      id: 'fm-mech-com-b',
      title: 'Centre of Mass B',
      category: 'FM - Further Mechanics',
      topic: 'Centre of Mass',
      qbtFile: '/tex/further-maths/further-mechanics/centre-of-mass/qbt/_QBT__Centre_of_Mass_B.pdf',
      solnFile: '/tex/further-maths/further-mechanics/centre-of-mass/soln/_QBT___Solns__Centre_of_Mass_B.pdf',
    });
    const out = insertPackRows(crlf, p, { afterId: 'fm-mech-com-a-solns' });
    expect(out).not.toMatch(/(?<!\r)\n/);
    expect(out).toContain("    topic: 'Centre of Mass',\r\n  },\r\n  {\r\n    id: 'fm-mech-com-b',");
    expect(verifyPackRows(out, p)).toEqual([]);
  });

  it('refuses an anchor row that is not there', () => {
    expect(() => insertPackRows(CATALOGUE, pack(), { afterId: 'fm-nope' })).toThrow(/fm-nope/);
  });
});

describe('insertPackRows with a mark scheme', () => {
  const msFile = '/tex/further-maths/core-pure/polar-coordinates/ms/_QBT___MS__Polar_B.pdf';

  it('writes the three rows together, and they read back', () => {
    const p = pack({ msFile });
    const out = insertPackRows(CATALOGUE, p, { afterId: 'fm-polar-a-solns' });
    expect(ids(out).slice(1, 6)).toEqual(['fm-polar-a', 'fm-polar-a-solns', 'fm-polar-b', 'fm-polar-b-solns', 'fm-polar-b-ms']);
    expect(verifyPackRows(out, p, CATALOGUE)).toEqual([]);
    const row = parseResourcesEntries(out).find((e) => e.id === 'fm-polar-b-ms');
    expect(row).toMatchObject({ type: 'markscheme', paperId: 'fm-polar-b', file: msFile, description: 'Mark scheme' });
    expect(row.pairId).toBeUndefined();
    expect(row.boards).toBeUndefined();
  });

  it('reports a mark scheme row that is missing', () => {
    const out = insertPackRows(CATALOGUE, pack(), { afterId: 'fm-polar-a-solns' });
    expect(verifyPackRows(out, pack({ msFile }))).toEqual(["row 'fm-polar-b-ms' parses 0 times, not once"]);
  });
});

describe('rowRanges', () => {
  it("finds each row with its id and category", () => {
    expect(rowRanges(CATALOGUE).map((r) => [r.id, r.category])).toEqual([
      ['tmua-a', 'TMUA'],
      ['fm-polar-a', 'FM - Core Pure'],
      ['fm-polar-a-solns', 'FM - Core Pure'],
      ['fm-induction-a', 'FM - Core Pure'],
      ['fm-induction-a-solns', 'FM - Core Pure'],
      ['fm-mech-com-a', 'FM - Further Mechanics'],
      ['fm-mech-com-a-solns', 'FM - Further Mechanics'],
    ]);
  });
});

describe('verifyPackRows', () => {
  it('reports rows that are missing or read back differently', () => {
    const p = pack();
    expect(verifyPackRows(CATALOGUE, p)).toEqual([
      "row 'fm-polar-b' parses 0 times, not once",
      "row 'fm-polar-b-solns' parses 0 times, not once",
    ]);
    const out = insertPackRows(CATALOGUE, p, { afterId: 'fm-polar-a-solns' });
    const wrong = verifyPackRows(out, { ...p, topic: 'Polar', boards: ['aqa'] });
    expect(wrong).toContain("row 'fm-polar-b' reads back topic Polar Coordinates, expected Polar");
    expect(wrong).toContain('row \'fm-polar-b\' reads back boards unset, expected ["aqa"]');
    expect(solutionsId('fm-x')).toBe('fm-x-solns');
  });

  it('given the text before, passes a clean insertion', () => {
    const p = pack();
    const out = insertPackRows(CATALOGUE, p, { afterId: 'fm-polar-a-solns' });
    expect(verifyPackRows(out, p, CATALOGUE)).toEqual([]);
  });

  it('given the text before, reports a neighbouring row the insertion swallowed', () => {
    // The anchor row closes on the line where the next row opens, so the new
    // rows land inside that line and the next row no longer parses.
    const before = CATALOGUE.replace("topic: 'Polar Coordinates',\n  },\n\n  // --- A-level Further Maths: Proof by Induction ---\n  {", "topic: 'Polar Coordinates',\n  }, {");
    expect(parseResourcesEntries(before).map((e) => e.id)).toContain('fm-induction-a');
    const p = pack();
    const out = insertPackRows(before, p, { afterId: 'fm-polar-a-solns' });
    expect(verifyPackRows(out, p)).toEqual([]);
    expect(verifyPackRows(out, p, before)).toEqual([
      "row 'fm-induction-a' no longer reads back as it was (row 4 is now 'fm-induction-a-solns')",
    ]);
  });
});
