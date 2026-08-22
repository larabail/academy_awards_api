import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://developer.uractor.com',
  integrations: [
    sitemap({
      // The key page is noindex and behind sign-in; keep it out of the sitemap.
      filter: (page) => !page.includes('/account'),
    }),
  ],
  build: {
    // Firebase Hosting serves /docs/errors from docs/errors.html with cleanUrls,
    // so emit flat files rather than directory-index pages.
    format: 'file',
  },
});
