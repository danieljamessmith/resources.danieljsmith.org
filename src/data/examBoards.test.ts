import { describe, expect, it } from 'vitest';
import { boardsForStrand, EXAM_BOARD_IDS, examBoardJsonIds } from './examBoards';

describe('exam-boards.json', () => {
  it('lists exactly the ExamBoard ids', () => {
    expect([...examBoardJsonIds()].sort()).toEqual([...EXAM_BOARD_IDS].sort());
  });

  it('gives Core Pure qualification codes and Further Mechanics paper codes', () => {
    expect(boardsForStrand('core-pure').find((b) => b.id === 'edexcel')).toEqual({
      id: 'edexcel',
      label: 'Edexcel',
      code: '9FM0',
      crumbs: ['Pearson Edexcel', '9FM0 Further Mathematics'],
    });
    expect(boardsForStrand('further-mechanics').find((b) => b.id === 'edexcel-fm1')).toEqual({
      id: 'edexcel-fm1',
      label: 'Edexcel FM1',
      code: '9FM0/3C',
      crumbs: ['Pearson Edexcel', '9FM0/3C Further Mechanics 1'],
    });
  });

  it('gives Additional Pure its four boards, in menu order, with paper codes', () => {
    expect(boardsForStrand('additional-pure')).toEqual([
      {
        id: 'edexcel-fp1',
        label: 'Edexcel FP1',
        code: '9FM0/3A',
        crumbs: ['Pearson Edexcel', '9FM0/3A Further Pure Mathematics 1'],
      },
      {
        id: 'edexcel-fp2',
        label: 'Edexcel FP2',
        code: '9FM0/4A',
        crumbs: ['Pearson Edexcel', '9FM0/4A Further Pure Mathematics 2'],
      },
      { id: 'ocr-a', label: 'OCR A', code: 'Y545', crumbs: ['OCR', 'Y545 Additional Pure Mathematics'] },
      {
        id: 'ocr-mei-extra-pure',
        label: 'OCR MEI Extra Pure',
        code: 'Y435',
        crumbs: ['OCR', 'Y435 Extra Pure'],
      },
    ]);
  });
});
