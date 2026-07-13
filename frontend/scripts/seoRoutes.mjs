/**
 * Public, indexable routes — single source of truth for
 * scripts/gen-sitemap.mjs (and any future prerenderer).
 *
 * Auth/admin routes must never be listed here; robots.txt blocks them too.
 * Lived in package.json's "seoRoutes" key until the Phase 1 repo cleanup —
 * route data is content, not package manifest metadata.
 */
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
  '/resources/blog/how-to-start-learning-quran',
  '/resources/blog/what-is-tajweed',
  '/resources/blog/noorani-qaida-explained',
  '/resources/blog/how-long-to-memorise-quran',
  '/resources/blog/why-learn-arabic-to-understand-quran',
  '/resources/blog/quran-memorization-tips-adults',
  '/resources/blog/understanding-fiqh-everyday-muslims',
  '/resources/faq',
  '/academy',
  '/academy/about',
  '/academy/teachers',
  '/academy/privacy',
  '/enroll',
];
