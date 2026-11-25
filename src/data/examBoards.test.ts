import { describe, expect, it } from 'vitest';
import { boardFamilyNames, boardsForStrand, EXAM_BOARD_IDS, examBoardJsonIds } from './examBoards';

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

describe('the Further Maths menu line', () => {
  const FAMILIES = [
    { id: 'edexcel', label: 'Edexcel' },
    { id: 'aqa', label: 'AQA' },
    { id: 'ocr-a', label: 'OCR A' },
    { id: 'ocr-mei', label: 'OCR MEI' },
    { id: 'cie-9231', label: 'CIE' },
  ];

  it('names each board by the family board whose id begins its own, once, in order', () => {
    const boards = [
      { id: 'edexcel-fm1', label: 'Edexcel FM1' },
      { id: 'edexcel-fm2', label: 'Edexcel FM2' },
      { id: 'aqa', label: 'AQA' },
      { id: 'ocr-a', label: 'OCR A' },
      { id: 'ocr-mei-mechanics-minor', label: 'OCR MEI Mech Minor' },
      { id: 'ocr-mei-mechanics-major', label: 'OCR MEI Mech Major' },
      { id: 'cie-9231', label: 'CIE' },
    ];
    expect(boardFamilyNames(boards, FAMILIES)).toEqual(['Edexcel', 'AQA', 'OCR A', 'OCR MEI', 'CIE']);
    expect(boardFamilyNames(boards.slice(5), FAMILIES)).toEqual(['OCR MEI', 'CIE']);
  });

  it('matches whole id parts, and keeps the label of a board no family begins', () => {
    const boards = [
      { id: 'ocr-mei-extra-pure', label: 'OCR MEI Extra Pure' },
      { id: 'ocr-another', label: 'OCR Another' },
      { id: 'aqa2', label: 'AQA 2' },
    ];
    expect(boardFamilyNames(boards, FAMILIES)).toEqual(['OCR MEI', 'OCR Another', 'AQA 2']);
  });
});
