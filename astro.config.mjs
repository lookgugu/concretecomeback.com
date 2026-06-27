import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://concretecomeback.com',

  integrations: [
    mdx(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      filter: (page) =>
        !page.includes('/thank-you') &&
        !page.includes('/draft/'),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  output: 'static',

  build: {
    format: 'directory',
    assets: '_assets',
  },
});
