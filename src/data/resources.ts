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
    id: 'tmua-paper-1-2023',
    title: 'TMUA Paper 1 - 2023',
    description: 'Full paper with mark scheme',
    file: '/pdfs/tmua-paper-1-2023.pdf',
    category: 'TMUA',
  },
  {
    id: 'tmua-paper-2-2023',
    title: 'TMUA Paper 2 - 2023',
    description: 'Full paper with mark scheme',
    file: '/pdfs/tmua-paper-2-2023.pdf',
    category: 'TMUA',
  },
  // Add more resources here...
];

export const categories = [...new Set(resources.map((r) => r.category))];

export function getResourceById(id: string): Resource | undefined {
  return resources.find((r) => r.id === id);
}
