import { describe, expect, it } from 'vitest';
import {
  describeLayout,
  initialState,
  layoutFromParams,
  pdfSrc,
  pick,
  readRemembered,
  serialiseRemembered,
  startingLayout,
  swap,
  withLayoutParams,
  type DocType,
} from './viewer';

const PACK: DocType[] = ['questions', 'markscheme', 'solutions'];
const PAIR: DocType[] = ['questions', 'solutions'];
const TMUA: DocType[] = ['questions', 'answers', 'solutions'];

describe('startingLayout', () => {
  it('puts the questions on the left and the page opened on the right', () => {
    expect(startingLayout(PACK, 'markscheme')).toEqual({ left: 'questions', right: 'markscheme' });
    expect(startingLayout(PACK, 'solutions')).toEqual({ left: 'questions', right: 'solutions' });
    expect(startingLayout(TMUA, 'answers')).toEqual({ left: 'questions', right: 'answers' });
  });

  it('on the questions page, uses the remembered right pane, else the solutions', () => {
    expect(startingLayout(PACK, 'questions', 'markscheme')).toEqual({ left: 'questions', right: 'markscheme' });
    expect(startingLayout(PACK, 'questions')).toEqual({ left: 'questions', right: 'solutions' });
    expect(startingLayout(PACK, 'questions', 'questions')).toEqual({ left: 'questions', right: 'solutions' });
  });

  it('ignores a remembered document the pack does not have', () => {
    expect(startingLayout(PAIR, 'questions', 'markscheme')).toEqual({ left: 'questions', right: 'solutions' });
    expect(startingLayout(['questions', 'answers'], 'questions', 'markscheme')).toEqual({ left: 'questions', right: 'answers' });
  });

  it('has no layout for a single document', () => {
    expect(startingLayout(['notes'], 'notes')).toBeNull();
    expect(startingLayout(['solutions'], 'solutions')).toBeNull();
  });
});

describe('pick and swap', () => {
  const layout = { left: 'questions', right: 'markscheme' } as const;

  it('changes only the pane picked', () => {
    expect(pick(layout, 'right', 'solutions')).toEqual({ left: 'questions', right: 'solutions' });
    expect(pick(layout, 'left', 'solutions')).toEqual({ left: 'solutions', right: 'markscheme' });
  });

  it("swaps the panes when picking the other pane's document", () => {
    expect(pick(layout, 'left', 'markscheme')).toEqual({ left: 'markscheme', right: 'questions' });
    expect(pick(layout, 'right', 'questions')).toEqual({ left: 'markscheme', right: 'questions' });
  });

  it('leaves the layout alone when picking what the pane already shows', () => {
    expect(pick(layout, 'left', 'questions')).toBe(layout);
  });

  it('swaps', () => {
    expect(swap(layout)).toEqual({ left: 'markscheme', right: 'questions' });
  });
});

describe('the address', () => {
  it('reads a layout of two different documents of this pack', () => {
    expect(layoutFromParams(new URLSearchParams('left=markscheme&right=solutions'), PACK)).toEqual({
      left: 'markscheme',
      right: 'solutions',
    });
    expect(layoutFromParams(new URLSearchParams('left=solutions&right=solutions'), PACK)).toBeNull();
    expect(layoutFromParams(new URLSearchParams('left=markscheme&right=solutions'), PAIR)).toBeNull();
    expect(layoutFromParams(new URLSearchParams('left=questions'), PACK)).toBeNull();
  });

  it('writes the layout and keeps other parameters', () => {
    const layout = { left: 'questions', right: 'markscheme' } as const;
    expect(withLayoutParams('?page=3&split=1', true, layout)).toBe('?page=3&left=questions&right=markscheme');
    expect(withLayoutParams('?left=questions&right=solutions&page=3', false, layout)).toBe('?page=3');
    expect(withLayoutParams('?split=1', false, null)).toBe('');
  });
});

describe('initialState', () => {
  const none = { split: false };

  it('prefers the address', () => {
    expect(initialState(new URLSearchParams('left=solutions&right=questions'), PACK, 'markscheme', { split: false, right: 'markscheme' })).toEqual({
      split: true,
      layout: { left: 'solutions', right: 'questions' },
    });
  });

  it('opens the starting layout for ?split=1 or a remembered side by side', () => {
    expect(initialState(new URLSearchParams('split=1'), PACK, 'solutions', none)).toEqual({
      split: true,
      layout: { left: 'questions', right: 'solutions' },
    });
    expect(initialState(new URLSearchParams(''), PACK, 'questions', { split: true, right: 'markscheme' })).toEqual({
      split: true,
      layout: { left: 'questions', right: 'markscheme' },
    });
  });

  it('opens single view otherwise, ready with the starting layout', () => {
    expect(initialState(new URLSearchParams('left=nonsense'), PACK, 'markscheme', none)).toEqual({
      split: false,
      layout: { left: 'questions', right: 'markscheme' },
    });
    expect(initialState(new URLSearchParams('split=1'), ['notes'], 'notes', { split: true })).toEqual({ split: false, layout: null });
  });
});

describe('the remembered layout', () => {
  it('round-trips', () => {
    expect(readRemembered(serialiseRemembered({ split: true, right: 'markscheme' }))).toEqual({ split: true, right: 'markscheme' });
    expect(readRemembered(serialiseRemembered({ split: false }))).toEqual({ split: false });
  });

  it('falls back to single view for missing or broken values', () => {
    expect(readRemembered(null)).toEqual({ split: false });
    expect(readRemembered('{not json')).toEqual({ split: false });
    expect(readRemembered('"split"')).toEqual({ split: false });
    expect(readRemembered('{"split":"yes","right":"diagram"}')).toEqual({ split: false });
  });
});

describe('describeLayout', () => {
  it('names both panes', () => {
    const labels: Record<string, string> = { markscheme: 'Mark scheme', solutions: 'Solutions' };
    expect(describeLayout({ left: 'markscheme', right: 'solutions' }, (t) => labels[t])).toBe(
      'Mark scheme on the left, solutions on the right.',
    );
  });
});

describe('pdfSrc', () => {
  it('adds FitH on Firefox only, and the page where given', () => {
    expect(pdfSrc('/a.pdf?v=1', false, null)).toBe('/a.pdf?v=1');
    expect(pdfSrc('/a.pdf?v=1', true, null)).toBe('/a.pdf?v=1#view=FitH');
    expect(pdfSrc('/a.pdf', false, '4')).toBe('/a.pdf#page=4');
    expect(pdfSrc('/a.pdf#x', true, '4')).toBe('/a.pdf#view=FitH&page=4');
  });
});
