import { describe, expect, it } from 'vitest';
import { getStrand, STRANDS } from './topics';
import { getExamBoardLabel } from './resources';

describe('the Further Maths strands', () => {
  it('are Core Pure, Further Mechanics and Additional Pure, in that order', () => {
    expect(STRANDS.map((s) => [s.category, s.title, s.href])).toEqual([
      ['FM - Core Pure', 'Core Pure', '/further-maths/core-pure/'],
      ['FM - Further Mechanics', 'Further Mechanics', '/further-maths/further-mechanics/'],
      ['FM - Additional Pure', 'Additional Pure', '/further-maths/additional-pure/'],
    ]);
  });

  it('give Additional Pure its sections in page order, its boards and its filter key', () => {
    const strand = getStrand('FM - Additional Pure')!;
    expect(strand.topics.map((t) => [t.id, t.topic, t.title, t.navLabel])).toEqual([
      ['miscellaneous-additional-pure', 'Miscellaneous Additional Pure', 'Miscellaneous Additional Pure', 'Misc Additional Pure'],
      ['further-calculus', 'Further Calculus', 'Further Calculus', 'Further Calculus'],
      ['differential-equations', 'Differential Equations', 'Differential Equations & Numerical Methods', 'Differential Equations'],
      ['conic-sections', 'Conic Sections', 'Conic Sections', 'Conic Sections'],
      ['vectors', 'Vectors', 'Vectors & Matrices', 'Vectors & Matrices'],
      ['groups', 'Groups', 'Groups', 'Groups'],
      ['number-theory', 'Number Theory', 'Number Theory', 'Number Theory'],
      ['recurrence-relations', 'Recurrence Relations', 'Recurrence Relations', 'Recurrence Relations'],
      ['surfaces', 'Surfaces', 'Surfaces & Partial Differentiation', 'Surfaces'],
    ]);
    expect(strand.boards.map((b) => b.id)).toEqual(['edexcel-fp1', 'edexcel-fp2', 'ocr-a', 'ocr-mei-extra-pure']);
    expect(strand.boardStorageKey).toBe('fm-ap-board-filter');
  });

  it("label an Additional Pure board's pill", () => {
    expect(getExamBoardLabel('edexcel-fp1')).toBe('Edexcel FP1');
    expect(getExamBoardLabel('ocr-mei-extra-pure')).toBe('OCR MEI Extra Pure');
  });
});
