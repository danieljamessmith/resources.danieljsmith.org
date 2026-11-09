import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { hiddenStrandHrefs } from './src/data/shown.ts';

/** A data file under `src/data/`, read as the site reads it. */
const readData = (name) => JSON.parse(readFileSync(new URL(`./src/data/${name}`, import.meta.url), 'utf8'));
// A strand page with no pack yet is left out, like the redirect and 404 pages.
const hiddenStrandPaths = new Set(
  hiddenStrandHrefs(readData('topics.json'), readData('resources.json')).map((href) => href.replace(/\/$/, '')),
);

export default defineConfig({
  site: 'https://resources.danieljsmith.org',
  trailingSlash: 'always',
  // Keep the whitespace between inline elements as written.
  compressHTML: true,
  integrations: [sitemap({
    filter: (page) => {
      const path = new URL(page).pathname.replace(/\/$/, '');
      return (
        !path.startsWith('/source/') &&
        path !== '/404' &&
        path !== '/further-maths' &&
        !hiddenStrandPaths.has(path)
      );
    },
  })],
  vite: {
    plugins: [tailwindcss()],
  },
});
