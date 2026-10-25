import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://resources.danieljsmith.org',
  trailingSlash: 'always',
  integrations: [sitemap({
    filter: (page) => {
      const path = new URL(page).pathname.replace(/\/$/, '');
      return !path.startsWith('/source/') && path !== '/404' && path !== '/further-maths';
    },
  })],
  vite: {
    plugins: [tailwindcss()],
  },
});
