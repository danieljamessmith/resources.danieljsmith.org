import strandRows from './topics.json';
import { resources, type Resource } from './resources';
import { boardsForStrand, type BoardStrandKey, type ExamBoardEntry } from './examBoards';
import { shownStrands, shownTopics } from './shown';

/** One topic section on a Further Maths strand page. */
export interface StrandTopic {
  /** Anchor id of the section heading, e.g. `complex-numbers`. */
  id: string;
  /** `Resource.topic` value the section lists. */
  topic: string;
  /** Section heading. */
  title: string;
  /** Shorter label for the sidebar and the mobile topic picker. */
  navLabel: string;
}

export interface Strand {
  category: string;
  title: string;
  href: string;
  /** The strand's boards, from its list in `exam-boards.json`. */
  boards: ExamBoardEntry[];
  /** localStorage key for the remembered exam-board filter. */
  boardStorageKey: string;
  topics: StrandTopic[];
}

/** A strand as `topics.json` holds it: its board list by its key in `exam-boards.json`. */
interface StrandRow extends Omit<Strand, 'boards'> {
  boardsKey: BoardStrandKey;
}

/**
 * The Further Maths strands, from `topics.json`: each strand's topic sections in
 * page order, its boards from its list in `exam-boards.json`.
 */
export const STRANDS: Strand[] = (strandRows as StrandRow[]).map(({ boardsKey, ...strand }) => ({
  ...strand,
  boards: boardsForStrand(boardsKey),
}));

export function getStrand(category: string): Strand | undefined {
  return STRANDS.find((s) => s.category === category);
}

/** The strands the home page, the header and the 404 page list: those with a row. */
export function getShownStrands(): Strand[] {
  return shownStrands(STRANDS, resources);
}

/** Whether a strand has a row; its page is `noindex` until it does. */
export function isStrandShown(strand: Strand): boolean {
  return shownStrands([strand], resources).length > 0;
}

/** A strand's sections that its page and section menu list: those with a row. */
export function getShownTopics(strand: Strand): StrandTopic[] {
  return shownTopics(strand, resources);
}

/** Strand listing URL, deep-linked to the resource's topic section when known. */
export function getStrandHrefForResource(resource: Resource): string | null {
  const strand = getStrand(resource.category);
  if (!strand) return null;
  const topic = strand.topics.find((t) => t.topic === resource.topic);
  return topic ? `${strand.href}#${topic.id}` : strand.href;
}
