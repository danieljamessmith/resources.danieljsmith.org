import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://resources.danieljsmith.org',
  integrations: [tailwind()],
});
