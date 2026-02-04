import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://resources.danieljsmith.org',
  integrations: [tailwind(), sitemap()],
});
