export interface Resource {
  id: string;
  title: string;
  description: string;
  file: string;
  category: string;
}

export const resources: Resource[] = [
  // Example resources - replace with your actual PDFs
  {
    id: 'tmua-setA-paper1',
    title: 'TMUA Set A  Paper 1',
    description: '20x Paper 1 Style TMUA Questions',
    file: '/pdfs/TMUA_SetA_Paper1.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-setA-paper2',
    title: 'TMUA Set A  Paper 2',
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
];

export const categories = [...new Set(resources.map((r) => r.category))];

export function getResourceById(id: string): Resource | undefined {
  return resources.find((r) => r.id === id);
}
