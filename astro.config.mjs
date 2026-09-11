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
      // Keep noindex confirmation/outcome pages out of the sitemap.
      filter: (page) =>
        !page.includes('/thank-you') &&
        !page.includes('/newsletter/') &&
        !page.includes('/draft/'),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  output: 'static',

  // pre-skate-warm-up-routine duplicated warm-up-routine-for-adult-skaters (same
  // author, same routine, four days apart) and was consolidated into it; keep the
  // old URL alive rather than 404 anyone who bookmarked or shared it.
  redirects: {
    '/blog/pre-skate-warm-up-routine/': '/blog/warm-up-routine-for-adult-skaters/',
  },

  build: {
    format: 'directory',
    assets: '_assets',
  },
});
