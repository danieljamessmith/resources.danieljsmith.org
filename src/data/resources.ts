export interface Resource {
  id: string;
  title: string;
  description: string;
  file: string;
  category: string;
  type?: 'questions' | 'solutions' | 'notes';
  pairId?: string;
  topic?: string;
}

export const resources: Resource[] = [
  // --- TMUA ---
  {
    id: 'tmua-setA-paper1',
    title: 'TMUA Set A Paper 1',
    description: '20x Paper 1 Style TMUA Questions',
    file: '/pdfs/tmua/TMUA_SetA_Paper1.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-setA-paper2',
    title: 'TMUA Set A Paper 2',
    description: '20x Paper 2 Style TMUA Questions',
    file: '/pdfs/tmua/TMUA_SetA_Paper2.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-setA-keys',
    title: 'TMUA Set A Answer Keys',
    description: 'Answer Keys to Set A Papers',
    file: '/pdfs/tmua/TMUA_SetA_AnswerKeys.pdf',
    category: 'TMUA',
  },

  // --- A-level Further Maths: Vectors ---
  {
    id: 'fm-vectors-formulae-notes',
    title: 'Vectors Formulae',
    description: 'Shortest distances, reflections, etc',
    file: '/pdfs/further-maths/vectors/notes/_Notes__Vectors_Formulae.pdf',
    category: 'A-level Further Maths',
    type: 'notes',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-shortest-distances',
    title: 'Shortest Distances',
    description: '8 exam-style questions',
    file: '/pdfs/further-maths/vectors/qbt/_QBT__Vectors___Shortest_Distances.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-vectors-shortest-distances-solns',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-shortest-distances-solns',
    title: 'Shortest Distances',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/vectors/soln/_QBT___Solns__Vectors___Shortest_Distances.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-vectors-shortest-distances',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-reflections-in-planes',
    title: 'Reflections in Planes',
    description: '7 exam-style questions',
    file: '/pdfs/further-maths/vectors/qbt/_QBT__Reflections_in_Planes.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-vectors-reflections-in-planes-solns',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-reflections-in-planes-solns',
    title: 'Reflections in Planes',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/vectors/soln/_QBT___Solns__Reflections_in_Planes.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-vectors-reflections-in-planes',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-plane-intersections',
    title: 'Plane Intersections',
    description: '7 exam-style questions',
    file: '/pdfs/further-maths/vectors/qbt/_QBT__Plane_Intersections.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-vectors-plane-intersections-solns',
    topic: 'Vectors',
  },
  {
    id: 'fm-vectors-plane-intersections-solns',
    title: 'Plane Intersections',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/vectors/soln/_QBT___Solns__Plane_Intersections.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-vectors-plane-intersections',
    topic: 'Vectors',
  },

  // --- A-level Further Maths: Differential Equations (teaching progression order) ---
  {
    id: 'fm-integrating-factor',
    title: 'Integrating Factor Method',
    description: '15 exam-style questions',
    file: '/pdfs/further-maths/differential-equations/qbt/_QBT__Integrating_Factor_Method.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-integrating-factor-solns',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-integrating-factor-solns',
    title: 'Integrating Factor Method',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/differential-equations/soln/_QBT___Solns__Integrating_Factor_Method.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-integrating-factor',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-modelling-1st-order',
    title: 'Modelling with 1st Order Differential Equations',
    description: '14 exam-style questions',
    file: '/pdfs/further-maths/differential-equations/qbt/_QBT__Modelling_with_1st_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-modelling-1st-order-solns',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-modelling-1st-order-solns',
    title: 'Modelling with 1st Order Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/differential-equations/soln/_QBT___Solns__Modelling_with_1st_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-modelling-1st-order',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-2nd-order-de',
    title: '2nd Order Differential Equations',
    description: '12 exam-style questions',
    file: '/pdfs/further-maths/differential-equations/qbt/_QBT__2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-2nd-order-de-solns',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-2nd-order-de-solns',
    title: '2nd Order Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/differential-equations/soln/_QBT___Solns__2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-2nd-order-de',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-modelling-2nd-order',
    title: 'Modelling with 2nd Order Differential Equations',
    description: '12 exam-style questions',
    file: '/pdfs/further-maths/differential-equations/qbt/_QBT__Modelling_with_2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-modelling-2nd-order-solns',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-modelling-2nd-order-solns',
    title: 'Modelling with 2nd Order Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/differential-equations/soln/_QBT___Solns__Modelling_with_2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-modelling-2nd-order',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-systems-de',
    title: 'Systems of Differential Equations',
    description: '11 exam-style questions',
    file: '/pdfs/further-maths/differential-equations/qbt/_QBT__Systems_of_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-systems-de-solns',
    topic: 'Differential Equations',
  },
  {
    id: 'fm-systems-de-solns',
    title: 'Systems of Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/further-maths/differential-equations/soln/_QBT___Solns__Systems_of_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-systems-de',
    topic: 'Differential Equations',
  },
];

export const categories = [...new Set(resources.map((r) => r.category))];

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
