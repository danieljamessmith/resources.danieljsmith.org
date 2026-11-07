import rows from './resources.json';
import counts from './question-counts.json';
import { fileHashes } from './fileHashes';
import { boardsForStrand, type ExamBoard, type ExamBoardEntry } from './examBoards';

export type { ExamBoard, ExamBoardEntry } from './examBoards';

/** Core Pure's exam boards, from `exam-boards.json`. */
export const EXAM_BOARDS: ExamBoardEntry[] = boardsForStrand('core-pure');

/** Further Mechanics' exam boards (papers), from `exam-boards.json`. */
export const FM_MECH_EXAM_BOARDS: ExamBoardEntry[] = boardsForStrand('further-mechanics');

export interface Resource {
  id: string;
  title: string;
  description: string;
  file: string;
  category: string;
  type?: 'questions' | 'solutions' | 'answers' | 'markscheme' | 'notes';
  pairId?: string;
  /**
   * Set on `answers` and `markscheme` rows only: the id of the `questions` paper
   * the answer key or mark scheme belongs to.
   */
  paperId?: string;
  topic?: string;
  /** Set on A-level Further Maths `questions` packs; drives list/view copy. */
  questionCount?: number;
  /** Optional label shown after question count, e.g. "FM Level". */
  note?: string;
  /**
   * Exam boards this pack is relevant for (typically set on `questions` and `notes` only).
   * Omitted or empty means all boards.
   */
  boards?: ExamBoard[];
  /** Human-friendly filename for the download attribute, e.g. "De Moivre's Theorem - Questions.pdf". */
  downloadName?: string;
  /**
   * Teaching position within the row's topic section (TMUA: within its
   * category). A paper's answer key, mark scheme and solutions take its value.
   */
  order: number;
}

/** A row's group for teaching order: its category and topic section. */
export function orderGroup(r: Pick<Resource, 'category' | 'topic'>): string {
  return `${r.category}\u0000${r.topic ?? ''}`;
}

/**
 * `rows` sorted by `order` within each group, groups kept where they first
 * appear and rows of equal `order` (a paper's family) kept in file order.
 */
export function inTeachingOrder<T extends Pick<Resource, 'category' | 'topic' | 'order'>>(rows: T[]): T[] {
  const first = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!first.has(orderGroup(r))) first.set(orderGroup(r), i);
  });
  return rows
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        first.get(orderGroup(a.r))! - first.get(orderGroup(b.r))! || a.r.order - b.r.order || a.i - b.i,
    )
    .map(({ r }) => r);
}

/** Questions per questions PDF, by its `/tex/...` path: `question-counts.json`. */
const questionCounts: Record<string, number> = counts;

/** Further Maths strand categories; prefix used for combined totals across strands. */
export const FM_CP = 'FM - Core Pure';
export const FM_MECH = 'FM - Further Mechanics';
export const FM_PREFIX = 'FM - ';

/**
 * The rows, in `resources.json`: one per document. Rows of a strand's topic
 * section (or of TMUA) list in `order`, their teaching order; a paper's answer
 * key, mark scheme and solutions share its `order` and follow it. The rows test
 * (`resources.test.ts`) checks the file is already in that order.
 */
const rawResources: Resource[] = inTeachingOrder(rows as unknown as Resource[]);

function buildDownloadName(title: string, type?: string): string {
  const label = type === 'markscheme' ? 'Mark Scheme' : type && type.charAt(0).toUpperCase() + type.slice(1);
  return `${title}${label ? ` - ${label}` : ''}.pdf`;
}

/** Populate questionCount, downloadName, and cache-busted file URL. */
export const resources: Resource[] = rawResources.map((r) => {
  const hash = fileHashes[r.file];
  return {
    ...r,
    file: hash ? `${r.file}?v=${hash}` : r.file,
    downloadName: buildDownloadName(r.title, r.type),
    ...(r.type === 'questions' && questionCounts[r.file] !== undefined
      ? { questionCount: questionCounts[r.file] }
      : {}),
  };
});

export function getResourceDisplayDescription(resource: Resource): string {
  if (
    resource.category.startsWith(FM_PREFIX) &&
    resource.type === 'questions' &&
    resource.questionCount != null
  ) {
    return `${resource.questionCount} exam-style questions`;
  }
  return resource.description;
}

/** Search-result description for a viewer page; fuller than the on-page display copy. */
export function getResourceMetaDescription(resource: Resource): string {
  if (resource.category.startsWith(FM_PREFIX)) {
    const count = getPaperFamily(resource).questions?.questionCount;
    const subject = `A-level Further Maths questions on ${resource.title}`;
    if (resource.type === 'questions') {
      return count != null
        ? `${count} free exam-style ${subject}, with full worked solutions.`
        : `Free exam-style ${subject}, with full worked solutions.`;
    }
    if (resource.type === 'solutions') {
      return `Full worked solutions to ${count != null ? `${count} ` : ''}${subject}. Free to view and download.`;
    }
    if (resource.type === 'markscheme') {
      return `Mark scheme for ${count != null ? `${count} ` : ''}${subject}. Free to view and download.`;
    }
  }
  return getResourceDisplayDescription(resource) || `${resource.title}: free maths resource with worked solutions.`;
}

export interface TmuaStats {
  sets: number;
  papers: number;
  questions: number;
  /** Questions in papers that have worked solutions. */
  solvedQuestions: number;
}

/** Link-preview image for TMUA pages; drawn from `og-images/`. */
export const TMUA_SHARE_IMAGE = {
  src: '/og/tmua.png',
  alt: 'Free TMUA practice papers with answer keys and worked solutions, beside a diagram of three touching circles',
  width: 1200,
  height: 630,
};

/** Live TMUA totals for listing copy and search descriptions. */
export function getTmuaStats(): TmuaStats {
  const papers = resources.filter((r) => r.category === 'TMUA' && r.type === 'questions');
  const sets = new Set(papers.map((r) => /^tmua-set([^-]+)-paper/.exec(r.id)?.[1] ?? r.id));
  const count = (rs: Resource[]) => rs.reduce((sum, r) => sum + (r.questionCount ?? 0), 0);
  return {
    sets: sets.size,
    papers: papers.length,
    questions: count(papers),
    solvedQuestions: count(papers.filter((r) => r.pairId)),
  };
}

/** Worksheet (question-sheet) count for one category; solutions aren't counted separately. */
export function getWorksheetCountByCategory(cat: string): number {
  return resources.filter((r) => r.category === cat && r.type === 'questions').length;
}

export function getResourceById(id: string): Resource | undefined {
  return resources.find((r) => r.id === id);
}

/** The answer key whose `paperId` names this paper, if it has one. */
export function getAnswerKey(paperId: string): Resource | undefined {
  return resources.find((r) => r.type === 'answers' && r.paperId === paperId);
}

/** The mark scheme whose `paperId` names this Further Maths pack, if it has one. */
export function getMarkScheme(paperId: string): Resource | undefined {
  return resources.find((r) => r.type === 'markscheme' && r.paperId === paperId);
}

export interface PaperFamily {
  questions?: Resource;
  answers?: Resource;
  markscheme?: Resource;
  solutions?: Resource;
}

/**
 * A paper with its answer key or mark scheme and its worked solutions, found from
 * any one of them. Resources outside a family (notes) return an empty object.
 */
export function getPaperFamily(r: Resource): PaperFamily {
  const questions =
    r.type === 'questions'
      ? r
      : (r.type === 'answers' || r.type === 'markscheme') && r.paperId
        ? getResourceById(r.paperId)
        : r.type === 'solutions' && r.pairId
          ? getResourceById(r.pairId)
          : undefined;
  if (!questions) return r.type === 'solutions' ? { solutions: r } : {};
  return {
    questions,
    answers: getAnswerKey(questions.id),
    markscheme: getMarkScheme(questions.id),
    solutions: questions.pairId ? getResourceById(questions.pairId) : undefined,
  };
}

/** A family's documents in listing order: questions, answer key or mark scheme, solutions. */
export function familyInOrder(family: PaperFamily): Resource[] {
  return [family.questions, family.answers, family.markscheme, family.solutions].filter(
    (r): r is Resource => r !== undefined,
  );
}

/**
 * Boards a resource applies to. `undefined` means all boards.
 * `solutions` and `markscheme` rows inherit from their `questions` resource when not set
 * on the row itself.
 */
export function getResourceBoards(r: Resource): ExamBoard[] | undefined {
  if (r.boards && r.boards.length > 0) return r.boards;
  const questionsId =
    r.type === 'solutions' ? r.pairId : r.type === 'markscheme' ? r.paperId : undefined;
  if (questionsId) {
    const q = getResourceById(questionsId);
    if (q?.boards && q.boards.length > 0) return q.boards;
  }
  return undefined;
}

/** Value for `data-boards` on listing cards: `"all"` or comma-separated ids. */
export function boardsToDataAttributeValue(boards: ExamBoard[] | undefined): string {
  if (!boards || boards.length === 0) return 'all';
  return boards.join(',');
}

export function getExamBoardLabel(id: ExamBoard): string {
  return [...EXAM_BOARDS, ...FM_MECH_EXAM_BOARDS].find((b) => b.id === id)?.label ?? id;
}

export function getDisplayExamBoards(boards: ExamBoard[] | undefined): ExamBoard[] | undefined {
  if (!boards) return undefined;
  if (
    boards.includes('ocr-mei-mechanics-major') &&
    boards.includes('ocr-mei-mechanics-minor')
  ) {
    return boards.filter((bid) => bid !== 'ocr-mei-mechanics-major');
  }
  return boards;
}

export function getResourcesByCategory(category: string): Resource[] {
  return resources.filter((r) => r.category === category);
}

export function getResourcesByTopic(category: string, topic: string): Resource[] {
  return resources.filter((r) => r.category === category && r.topic === topic);
}

export function getResourcePairs(category: string, topic: string) {
  const questions = resources.filter(
    (r) => r.category === category && r.type === 'questions' && r.topic === topic,
  );
  return questions.map((q) => ({
    questions: q,
    markscheme: getMarkScheme(q.id),
    solutions: q.pairId ? getResourceById(q.pairId) : undefined,
  }));
}
