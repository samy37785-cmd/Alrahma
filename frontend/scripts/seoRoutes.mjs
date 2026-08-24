/**
 * Public, indexable routes — single source of truth for
 * scripts/gen-sitemap.mjs (and any future prerenderer).
 *
 * Auth/admin routes must never be listed here; robots.txt blocks them too.
 * Lived in package.json's "seoRoutes" key until the Phase 1 repo cleanup —
 * route data is content, not package manifest metadata.
 */
import { TEACHERS } from '../src/data/marketing/teachers.js';

export const seoRoutes = [
  '/',
  '/courses',
  '/courses/quran',
  '/courses/ijazah',
  '/courses/islamic-studies',
  '/courses/arabic',
  '/tools',
  '/tools/quran-reader',
  '/tools/adhkar',
  '/tools/hadith',
  '/tools/prayer',
  '/tools/prayer-times',
  '/tools/qibla',
  '/tools/islamic-calendar',
  '/tools/verse-of-the-day',
  '/tools/tasbeeh',
  '/tools/arabic-alphabet',
  '/resources',
  '/resources/blog',
  // Individual /resources/blog/<slug> posts are added here only once they
  // actually exist as published posts in the Blog collection — the DB has
  // zero posts right now, and sitemapping URLs with no real content behind
  // them is a soft-404 signal to crawlers.
  '/resources/faq',
  '/academy',
  '/academy/about',
  '/academy/teachers',
  // One entry per real teacher profile (App.jsx: /academy/teachers/:id) —
  // sourced from the same TEACHERS list the directory itself renders, so
  // this can't drift out of sync with what's actually crawlable.
  ...TEACHERS.map((t) => `/academy/teachers/${t.id}`),
  '/academy/privacy',
  '/academy/terms',
  '/academy/refund-policy',
  '/enroll',
];
