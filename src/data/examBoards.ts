import examBoards from './exam-boards.json';

/**
 * Every exam board id, as the `boards` lists in `resources.json` use them.
 * `exam-boards.json` lists the same ids (`examBoards.test.ts` checks), with
 * each board's label and codes per strand.
 */
export const EXAM_BOARD_IDS = [
  'edexcel',
  'ocr-a',
  'ocr-mei',
  'aqa',
  'cie-9231',
  'edexcel-fm1',
  'edexcel-fm2',
  'ocr-mei-mechanics-minor',
  'ocr-mei-mechanics-major',
  'edexcel-fp1',
  'edexcel-fp2',
  'ocr-mei-extra-pure',
] as const;

/** UK/international exam board or module filters for A-level Further Maths. */
export type ExamBoard = (typeof EXAM_BOARD_IDS)[number];

/** A strand's key in `exam-boards.json`: its folder under `public/tex/further-maths/`. */
export type BoardStrandKey = 'core-pure' | 'further-mechanics' | 'additional-pure';

interface CodeName {
  code: string;
  name?: string;
}

interface BoardRecord {
  id: string;
  label: string;
  body: string;
  qualification: CodeName;
  paper?: CodeName;
}

interface StrandRecord {
  code: 'qualification' | 'paper';
  boards: BoardRecord[];
}

export interface ExamBoardEntry {
  id: ExamBoard;
  /** Label for the pills and the board menu. */
  label: string;
  /**
   * The code the strand shows: its qualification's in Core Pure, its paper's in
   * Further Mechanics and Additional Pure.
   */
  code: string;
  /**
   * The breadcrumb the filter status line shows for the chosen board: the
   * awarding body, then the qualification (Core Pure) or the paper, whose
   * code already names the qualification (Further Mechanics, Additional Pure).
   */
  crumbs: string[];
}

function strandRecord(key: BoardStrandKey): StrandRecord {
  return examBoards[key] as StrandRecord;
}

function toEntry(strand: StrandRecord, b: BoardRecord): ExamBoardEntry {
  const q = b.qualification;
  const usePaper = strand.code === 'paper' && b.paper !== undefined;
  const code = usePaper ? b.paper!.code : q.code;
  const crumbs = usePaper
    ? [b.body, [b.paper!.code, b.paper!.name].filter(Boolean).join(' ')]
    : [b.body, [q.code, q.name].filter(Boolean).join(' ')];
  return { id: b.id as ExamBoard, label: b.label, code, crumbs };
}

/** A strand's boards, in the order its board menu lists them. */
export function boardsForStrand(key: BoardStrandKey): ExamBoardEntry[] {
  const strand = strandRecord(key);
  return strand.boards.map((b) => toEntry(strand, b));
}

/**
 * A strand's boards as the Further Maths menu names them: each by the family
 * board (a Core Pure board) whose id is its own or begins it, so Edexcel FM1
 * and FM2 are both "Edexcel", and each name once, in the strand's order. A
 * board no family board begins keeps its own label.
 */
export function boardFamilyNames(
  boards: readonly { id: string; label: string }[],
  families: readonly { id: string; label: string }[],
): string[] {
  const names = boards.map((b) => {
    const family = families
      .filter((f) => b.id === f.id || b.id.startsWith(`${f.id}-`))
      .sort((x, y) => y.id.length - x.id.length)[0];
    return family ? family.label : b.label;
  });
  return [...new Set(names)];
}

/**
 * The line under a strand's name in the Further Maths menu, from its boards in
 * `exam-boards.json`: "Edexcel, AQA, OCR A, OCR MEI, CIE".
 */
export function boardsLine(boards: readonly { id: string; label: string }[]): string {
  return boardFamilyNames(boards, strandRecord('core-pure').boards).join(', ');
}

/** Every board id `exam-boards.json` lists, in any strand. */
export function examBoardJsonIds(): string[] {
  const keys: BoardStrandKey[] = ['core-pure', 'further-mechanics', 'additional-pure'];
  return [...new Set(keys.flatMap((k) => strandRecord(k).boards.map((b) => b.id)))];
}
