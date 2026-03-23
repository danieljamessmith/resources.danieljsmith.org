export interface Resource {
  id: string;
  title: string;
  description: string;
  file: string;
  category: string;
  type?: 'questions' | 'solutions';
  pairId?: string;
}

export const resources: Resource[] = [
  // --- TMUA ---
  {
    id: 'tmua-setA-paper1',
    title: 'TMUA Set A Paper 1',
    description: '20x Paper 1 Style TMUA Questions',
    file: '/pdfs/TMUA_SetA_Paper1.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-setA-paper2',
    title: 'TMUA Set A Paper 2',
    description: '20x Paper 2 Style TMUA Questions',
    file: '/pdfs/TMUA_SetA_Paper2.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-setA-keys',
    title: 'TMUA Set A Answer Keys',
    description: 'Answer Keys to Set A Papers',
    file: '/pdfs/TMUA_SetA_AnswerKeys.pdf',
    category: 'TMUA',
  },

  // --- A-level Further Maths: Differential Equations (teaching progression order) ---
  {
    id: 'fm-integrating-factor',
    title: 'Integrating Factor Method',
    description: '15 exam-style questions',
    file: '/pdfs/_QBT__Integrating_Factor_Method.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-integrating-factor-solns',
  },
  {
    id: 'fm-integrating-factor-solns',
    title: 'Integrating Factor Method',
    description: 'Full worked solutions',
    file: '/pdfs/_QBT___Solns__Integrating_Factor_Method.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-integrating-factor',
  },
  {
    id: 'fm-modelling-1st-order',
    title: 'Modelling with 1st Order Differential Equations',
    description: '14 exam-style questions',
    file: '/pdfs/_QBT__Modelling_with_1st_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-modelling-1st-order-solns',
  },
  {
    id: 'fm-modelling-1st-order-solns',
    title: 'Modelling with 1st Order Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/_QBT___Solns__Modelling_with_1st_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-modelling-1st-order',
  },
  {
    id: 'fm-2nd-order-de',
    title: '2nd Order Differential Equations',
    description: '12 exam-style questions',
    file: '/pdfs/_QBT__2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-2nd-order-de-solns',
  },
  {
    id: 'fm-2nd-order-de-solns',
    title: '2nd Order Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/_QBT___Solns__2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-2nd-order-de',
  },
  {
    id: 'fm-modelling-2nd-order',
    title: 'Modelling with 2nd Order Differential Equations',
    description: '12 exam-style questions',
    file: '/pdfs/_QBT__Modelling_with_2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-modelling-2nd-order-solns',
  },
  {
    id: 'fm-modelling-2nd-order-solns',
    title: 'Modelling with 2nd Order Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/_QBT___Solns__Modelling_with_2nd_Order_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-modelling-2nd-order',
  },
  {
    id: 'fm-systems-de',
    title: 'Systems of Differential Equations',
    description: '11 exam-style questions',
    file: '/pdfs/_QBT__Systems_of_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'questions',
    pairId: 'fm-systems-de-solns',
  },
  {
    id: 'fm-systems-de-solns',
    title: 'Systems of Differential Equations',
    description: 'Full worked solutions',
    file: '/pdfs/_QBT___Solns__Systems_of_Differential_Equations.pdf',
    category: 'A-level Further Maths',
    type: 'solutions',
    pairId: 'fm-systems-de',
  },
];

export const categories = [...new Set(resources.map((r) => r.category))];

export function getResourceById(id: string): Resource | undefined {
  return resources.find((r) => r.id === id);
}

export function getResourcesByCategory(category: string): Resource[] {
  return resources.filter((r) => r.category === category);
}

export function getResourcePairs(category: string) {
  const questions = resources.filter(
    (r) => r.category === category && r.type === 'questions',
  );
  return questions.map((q) => ({
    questions: q,
    solutions: resources.find((r) => r.id === q.pairId),
  }));
}
