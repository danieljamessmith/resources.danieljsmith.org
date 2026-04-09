export interface Resource {
  id: string;
  title: string;
  description: string;
  file: string;
  category: string;
  type?: 'questions' | 'solutions' | 'notes';
  pairId?: string;
  topic?: string;
  /** Set on A-level Further Maths `questions` packs; drives list/view copy. */
  questionCount?: number;
}

const FM = 'A-level Further Maths';

export const resources: Resource[] = [
  // --- TMUA ---
  {
    id: 'tmua-setA-paper1',
    title: 'TMUA Set A Paper 1',
    description: '20x Paper 1 Style TMUA Questions',
    file: '/tex/tmua/TMUA_SetA_Paper1.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-setA-paper2',
    title: 'TMUA Set A Paper 2',
    description: '20x Paper 2 Style TMUA Questions',
    file: '/tex/tmua/TMUA_SetA_Paper2.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-setA-keys',
    title: 'TMUA Set A Answer Keys',
    description: 'Answer Keys to Set A Papers',
    file: '/tex/tmua/TMUA_SetA_AnswerKeys.pdf',
    category: 'TMUA',
  },

  // --- A-level Further Maths: Complex Numbers (QBT sheets) ---
  {
    id: 'fm-complex-roots-geometry',
    title: 'Complex Roots and Geometry Problems',
    description: '',
    file: '/tex/further-maths/complex-numbers/qbt/_QBT__Complex_Roots_and_Geometry_Problems.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-complex-roots-geometry-solns',
    topic: 'Complex Numbers',
    questionCount: 13,
  },
  {
    id: 'fm-complex-roots-geometry-solns',
    title: 'Complex Roots and Geometry Problems',
    description: 'Full worked solutions',
    file: '/tex/further-maths/complex-numbers/soln/_QBT___Solns__Complex_Roots_and_Geometry_Problems.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-complex-roots-geometry',
    topic: 'Complex Numbers',
  },
  {
    id: 'fm-complex-series',
    title: 'Complex Series',
    description: '',
    file: '/tex/further-maths/complex-numbers/qbt/_QBT__Complex_Series.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-complex-series-solns',
    topic: 'Complex Numbers',
    questionCount: 7,
  },
  {
    id: 'fm-complex-series-solns',
    title: 'Complex Series',
    description: 'Full worked solutions',
    file: '/tex/further-maths/complex-numbers/soln/_QBT___Solns__Complex_Series.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-complex-series',
    topic: 'Complex Numbers',
  },

  // --- A-level Further Maths: Vectors (Notes → pairs in teaching order) ---
  {
    id: 'fm-vectors-formulae-notes',
    title: 'Vectors Formula Sheet',
    description: 'Formula Sheet for Shortest Distances, Reflections, etc',
    file: '/tex/further-maths/vectors/notes/_Notes__Vectors_Formulae.pdf',
    category: FM,
    type: 'notes',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-vector-product',
    title: 'Vector Product (Cross Product)',
    description: '',
    file: '/tex/further-maths/vectors/qbt/_QBT__Vector_Product.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-vectors-vector-product-solns',
    topic: 'Vectors',
    questionCount: 10,
  },
  {
    id: 'fm-vectors-vector-product-solns',
    title: 'Vector Product',
    description: 'Full worked solutions',
    file: '/tex/further-maths/vectors/soln/_QBT___Solns__Vector_Product.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-vectors-vector-product',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-shortest-distances',
    title: 'Shortest Distances',
    description: '',
    file: '/tex/further-maths/vectors/qbt/_QBT__Vectors___Shortest_Distances.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-vectors-shortest-distances-solns',
    topic: 'Vectors',
    questionCount: 8,
  },
  {
    id: 'fm-vectors-shortest-distances-solns',
    title: 'Shortest Distances',
    description: 'Full worked solutions',
    file: '/tex/further-maths/vectors/soln/_QBT___Solns__Vectors___Shortest_Distances.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-vectors-shortest-distances',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-plane-intersections',
    title: 'Plane Intersections',
    description: '',
    file: '/tex/further-maths/vectors/qbt/_QBT__Plane_Intersections.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-vectors-plane-intersections-solns',
    topic: 'Vectors',
    questionCount: 7,
  },
  {
    id: 'fm-vectors-plane-intersections-solns',
    title: 'Plane Intersections',
    description: 'Full worked solutions',
    file: '/tex/further-maths/vectors/soln/_QBT___Solns__Plane_Intersections.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-vectors-plane-intersections',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-reflections-in-planes',
    title: 'Reflections in Planes',
    description: '',
    file: '/tex/further-maths/vectors/qbt/_QBT__Reflections_in_Planes.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-vectors-reflections-in-planes-solns',
    topic: 'Vectors',
    questionCount: 7,
  },
  {
    id: 'fm-vectors-reflections-in-planes-solns',
    title: 'Reflections in Planes',
    description: 'Full worked solutions',
    file: '/tex/further-maths/vectors/soln/_QBT___Solns__Reflections_in_Planes.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-vectors-reflections-in-planes',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-linear-transformations',
    title: 'Linear Transformations',
    description: '',
    file: '/tex/further-maths/vectors/qbt/_QBT__Linear_Transformations.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-vectors-linear-transformations-solns',
    topic: 'Vectors',
    questionCount: 11,
  },
  {
    id: 'fm-vectors-linear-transformations-solns',
    title: 'Linear Transformations',
    description: 'Full worked solutions',
    file: '/tex/further-maths/vectors/soln/_QBT___Solns__Linear_Transformations.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-vectors-linear-transformations',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-invariant-points-and-lines',
    title: 'Invariant Points and Lines',
    description: '',
    file: '/tex/further-maths/vectors/qbt/_QBT__Invariant_Points_and_Lines.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-vectors-invariant-points-and-lines-solns',
    topic: 'Vectors',
    questionCount: 9,
  },
  {
    id: 'fm-vectors-invariant-points-and-lines-solns',
    title: 'Invariant Points and Lines',
    description: 'Full worked solutions',
    file: '/tex/further-maths/vectors/soln/_QBT___Solns__Invariant_Points_and_Lines.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-vectors-invariant-points-and-lines',
    topic: 'Vectors',
  },

  // --- A-level Further Maths: Further Calculus (notes → pairs in teaching order) ---
  {
    id: 'fm-further-tabular-ibp-notes',
    title: 'Tabular Method for IBP',
    description: 'Fast method for repeated Integration By Parts',
    file: '/tex/further-maths/further-calculus/notes/_Notes__Tabular_Method_for_IBP.pdf',
    category: FM,
    type: 'notes',
    topic: 'Further Calculus',
  },
  {
    id: 'fm-further-integration-by-parts',
    title: 'Integration by Parts (FM Level)',
    description: '',
    file: '/tex/further-maths/further-calculus/qbt/_QBT__Integration_by_Parts__FM_Level_.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-further-integration-by-parts-solns',
    topic: 'Further Calculus',
    questionCount: 15,
  },
  {
    id: 'fm-further-integration-by-parts-solns',
    title: 'Integration by Parts',
    description: 'Full worked solutions',
    file: '/tex/further-maths/further-calculus/soln/_QBT___Solns__Integration_by_Parts__FM_Level_.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-further-integration-by-parts',
    topic: 'Further Calculus',
  },
  {
    id: 'fm-further-integration-by-substitution',
    title: 'Integration by Substitution (FM Level)',
    description: '',
    file: '/tex/further-maths/further-calculus/qbt/_QBT__Integration_by_Substitution__FM_Level_.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-further-integration-by-substitution-solns',
    topic: 'Further Calculus',
    questionCount: 15,
  },
  {
    id: 'fm-further-integration-by-substitution-solns',
    title: 'Integration by Substitution',
    description: 'Full worked solutions',
    file: '/tex/further-maths/further-calculus/soln/_QBT___Solns__Integration_by_Substitution__FM_Level_.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-further-integration-by-substitution',
    topic: 'Further Calculus',
  },
  {
    id: 'fm-further-volumes-revolution',
    title: 'Volumes of Revolution',
    description: '',
    file: '/tex/further-maths/further-calculus/qbt/_QBT__Volumes_of_Revolution.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-further-volumes-revolution-solns',
    topic: 'Further Calculus',
    questionCount: 15,
  },
  {
    id: 'fm-further-volumes-revolution-solns',
    title: 'Volumes of Revolution',
    description: 'Full worked solutions',
    file: '/tex/further-maths/further-calculus/soln/_QBT___Solns__Volumes_of_Revolution.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-further-volumes-revolution',
    topic: 'Further Calculus',
  },
  {
    id: 'fm-further-maclaurin-series',
    title: 'Maclaurin Series',
    description: '',
    file: '/tex/further-maths/further-calculus/qbt/_QBT__Maclaurin_Series.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-further-maclaurin-series-solns',
    topic: 'Further Calculus',
    questionCount: 17,
  },
  {
    id: 'fm-further-maclaurin-series-solns',
    title: 'Maclaurin Series',
    description: 'Full worked solutions',
    file: '/tex/further-maths/further-calculus/soln/_QBT___Solns__Maclaurin_Series.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-further-maclaurin-series',
    topic: 'Further Calculus',
  },

  // --- A-level Further Maths: Differential Equations (teaching progression order) ---
  {
    id: 'fm-integrating-factor',
    title: 'Integrating Factor Method',
    description: '',
    file: '/tex/further-maths/differential-equations/qbt/_QBT__Integrating_Factor_Method.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-integrating-factor-solns',
    topic: 'Differential Equations',
    questionCount: 15,
  },
  {
    id: 'fm-integrating-factor-solns',
    title: 'Integrating Factor Method',
    description: 'Full worked solutions',
    file: '/tex/further-maths/differential-equations/soln/_QBT___Solns__Integrating_Factor_Method.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-integrating-factor',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-modelling-1st-order',
    title: 'Modelling with 1st Order Differential Equations',
    description: '',
    file: '/tex/further-maths/differential-equations/qbt/_QBT__Modelling_with_1st_Order_Differential_Equations.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-modelling-1st-order-solns',
    topic: 'Differential Equations',
    questionCount: 14,
  },
  {
    id: 'fm-modelling-1st-order-solns',
    title: 'Modelling with 1st Order Differential Equations',
    description: 'Full worked solutions',
    file: '/tex/further-maths/differential-equations/soln/_QBT___Solns__Modelling_with_1st_Order_Differential_Equations.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-modelling-1st-order',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-2nd-order-de',
    title: '2nd Order Differential Equations',
    description: '',
    file: '/tex/further-maths/differential-equations/qbt/_QBT__2nd_Order_Differential_Equations.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-2nd-order-de-solns',
    topic: 'Differential Equations',
    questionCount: 12,
  },
  {
    id: 'fm-2nd-order-de-solns',
    title: '2nd Order Differential Equations',
    description: 'Full worked solutions',
    file: '/tex/further-maths/differential-equations/soln/_QBT___Solns__2nd_Order_Differential_Equations.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-2nd-order-de',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-modelling-2nd-order',
    title: 'Modelling with 2nd Order Differential Equations',
    description: '',
    file: '/tex/further-maths/differential-equations/qbt/_QBT__Modelling_with_2nd_Order_Differential_Equations.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-modelling-2nd-order-solns',
    topic: 'Differential Equations',
    questionCount: 12,
  },
  {
    id: 'fm-modelling-2nd-order-solns',
    title: 'Modelling with 2nd Order Differential Equations',
    description: 'Full worked solutions',
    file: '/tex/further-maths/differential-equations/soln/_QBT___Solns__Modelling_with_2nd_Order_Differential_Equations.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-modelling-2nd-order',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-systems-de',
    title: 'Systems of Differential Equations',
    description: '',
    file: '/tex/further-maths/differential-equations/qbt/_QBT__Systems_of_Differential_Equations.pdf',
    category: FM,
    type: 'questions',
    pairId: 'fm-systems-de-solns',
    topic: 'Differential Equations',
    questionCount: 11,
  },
  {
    id: 'fm-systems-de-solns',
    title: 'Systems of Differential Equations',
    description: 'Full worked solutions',
    file: '/tex/further-maths/differential-equations/soln/_QBT___Solns__Systems_of_Differential_Equations.pdf',
    category: FM,
    type: 'solutions',
    pairId: 'fm-systems-de',
    topic: 'Differential Equations',
  },
];

export const categories = [...new Set(resources.map((r) => r.category))];

export function getResourceDisplayDescription(resource: Resource): string {
  if (resource.category === FM && resource.type === 'questions' && resource.questionCount != null) {
    return `${resource.questionCount} exam-style questions`;
  }
  return resource.description;
}

export function getFurtherMathsTotalQuestionCount(): number {
  return resources
    .filter((r) => r.category === FM && r.type === 'questions')
    .reduce((sum, r) => sum + (r.questionCount ?? 0), 0);
}

/** Rounded down to nearest 10; use for marketing line when >= 10. */
export function getFurtherMathsQuestionTotalRoundedDownTen(): number {
  return Math.floor(getFurtherMathsTotalQuestionCount() / 10) * 10;
}

export function getResourceById(id: string): Resource | undefined {
  return resources.find((r) => r.id === id);
}

export function getResourcesByCategory(category: string): Resource[] {
  return resources.filter((r) => r.category === category);
}

export function getResourcesByTopic(category: string, topic: string): Resource[] {
  return resources.filter((r) => r.category === category && r.topic === topic);
}

export function getResourcePairs(category: string, topic?: string) {
  const questions = resources.filter(
    (r) =>
      r.category === category &&
      r.type === 'questions' &&
      (topic === undefined || r.topic === topic),
  );
  return questions.map((q) => ({
    questions: q,
    solutions: resources.find((r) => r.id === q.pairId),
  }));
}
