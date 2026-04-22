// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://quran-reader-ar.pages.dev',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'ar', locales: { ar: 'ar' } },
      filter: (page) => !page.includes('/auth/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // Never inline the Tailwind bundle. With 6996 pages the duplication
    // would be ~300MB extra on disk and wire; a shared hashed stylesheet
    // at /_astro/*.css (cached immutable for one year) is much better.
    inlineStylesheets: 'never',
  },
  compressHTML: true,
});
