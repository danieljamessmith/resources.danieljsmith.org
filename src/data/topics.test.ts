import { describe, expect, it } from 'vitest';
import { getStrand, STRANDS } from './topics';
import { getExamBoardLabel } from './resources';

describe('the Further Maths strands', () => {
  it('are Core Pure, Optional Pure and Further Mechanics, in that order', () => {
    expect(STRANDS.map((s) => [s.category, s.title, s.href])).toEqual([
      ['FM - Core Pure', 'Core Pure', '/further-maths/core-pure/'],
      ['FM - Optional Pure', 'Optional Pure', '/further-maths/optional-pure/'],
      ['FM - Further Mechanics', 'Further Mechanics', '/further-maths/further-mechanics/'],
    ]);
  });

  it('give Optional Pure its sections in page order, its boards and its filter key', () => {
    const strand = getStrand('FM - Optional Pure')!;
    expect(strand.topics.map((t) => [t.id, t.topic, t.title, t.navLabel])).toEqual([
      ['miscellaneous-optional-pure', 'Miscellaneous Optional Pure', 'Miscellaneous Optional Pure', 'Misc Optional Pure'],
      ['further-calculus', 'Further Calculus', 'Further Calculus', 'Further Calculus'],
      ['differential-equations', 'Differential Equations', 'Differential Equations & Numerical Methods', 'Differential Equations'],
      ['conic-sections', 'Conic Sections', 'Conic Sections', 'Conic Sections'],
      ['vectors', 'Vectors', 'Vectors & Matrices', 'Vectors & Matrices'],
      ['groups', 'Groups', 'Groups', 'Groups'],
      ['number-theory', 'Number Theory', 'Number Theory', 'Number Theory'],
      ['recurrence-relations', 'Recurrence Relations', 'Recurrence Relations', 'Recurrence Relations'],
      ['surfaces', 'Surfaces', 'Surfaces & Partial Differentiation', 'Surfaces'],
    ]);
    expect(strand.boardStorageKey).toBe('fm-op-board-filter');
  });

  it("label an Optional Pure board's pill", () => {
    expect(getExamBoardLabel('edexcel-fp1')).toBe('Edexcel FP1');
    expect(getExamBoardLabel('ocr-mei-extra-pure')).toBe('OCR MEI Extra Pure');
  });
});
