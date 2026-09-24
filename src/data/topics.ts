import {
  EXAM_BOARDS,
  FM_CP,
  FM_MECH,
  FM_MECH_EXAM_BOARDS,
  type ExamBoard,
  type Resource,
} from './resources';

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
  boards: { id: ExamBoard; label: string }[];
  /** localStorage key for the remembered exam-board filter. */
  boardStorageKey: string;
  topics: StrandTopic[];
}

export const STRANDS: Strand[] = [
  {
    category: FM_CP,
    title: 'Core Pure',
    href: '/further-maths/core-pure',
    boards: EXAM_BOARDS,
    boardStorageKey: 'fm-cp-board-filter',
    topics: [
      { id: 'miscellaneous-pure', topic: 'Miscellaneous Pure', title: 'Miscellaneous Pure', navLabel: 'Misc Pure' },
      { id: 'further-calculus', topic: 'Further Calculus', title: 'Further Calculus', navLabel: 'Further Calculus' },
      { id: 'polar-coordinates', topic: 'Polar Coordinates', title: 'Polar Coordinates', navLabel: 'Polar Coordinates' },
      { id: 'differential-equations', topic: 'Differential Equations', title: 'Differential Equations', navLabel: 'Differential Equations' },
      { id: 'complex-numbers', topic: 'Complex Numbers', title: 'Complex Numbers', navLabel: 'Complex Numbers' },
      { id: 'proof-by-induction', topic: 'Proof by Induction', title: 'Proof by Induction', navLabel: 'Proof by Induction' },
      { id: 'vectors', topic: 'Vectors', title: 'Vectors, Matrices & Linear Transformations', navLabel: 'Vectors & Matrices' },
    ],
  },
  {
    category: FM_MECH,
    title: 'Further Mechanics',
    href: '/further-maths/further-mechanics',
    boards: FM_MECH_EXAM_BOARDS,
    boardStorageKey: 'fm-mech-board-filter',
    topics: [
      { id: 'miscellaneous-mechanics', topic: 'Miscellaneous Mechanics', title: 'Miscellaneous Mechanics', navLabel: 'Misc Mechanics' },
      { id: 'momentum-restitution-collisions', topic: 'Momentum & Collisions', title: 'Momentum & Collisions', navLabel: 'Momentum & Collisions' },
      { id: 'work-energy-power', topic: 'Work, Energy and Power', title: 'Work, Energy and Power', navLabel: 'Work, Energy and Power' },
      { id: 'centre-of-mass', topic: 'Centre of Mass', title: 'Centre of Mass', navLabel: 'Centre of Mass' },
    ],
  },
];

export function getStrand(category: string): Strand | undefined {
  return STRANDS.find((s) => s.category === category);
}

/** Strand listing URL, deep-linked to the resource's topic section when known. */
export function getStrandHrefForResource(resource: Resource): string | null {
  const strand = getStrand(resource.category);
  if (!strand) return null;
  const topic = strand.topics.find((t) => t.topic === resource.topic);
  return topic ? `${strand.href}#${topic.id}` : strand.href;
}
