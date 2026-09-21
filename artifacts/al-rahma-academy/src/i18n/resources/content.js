// Resources hub + Blog Arabic copy fix (Comprehensive EN/AR Audit Phase 2):
// two confirmed English leaks on otherwise-Arabic pages, found live on
// /ar/resources and /ar/resources/blog.
//
// 1) ResourcesHub.jsx ("/resources") called useSEO() with a hardcoded
//    English description literal and no lang branch at all, so meta
//    description stayed English on /ar/resources while the rest of the
//    page's body content (t.hubs.resources) was already Arabic. Same fix
//    shape as src/i18n/academy/seo.js and src/i18n/courses/seo.js — only
//    en/ar are real content here; it/es/de/fr are not published for this
//    page and must not be claimed as such.
//
//    English description text is kept byte-for-byte identical to what the
//    page already rendered before this change (previously inline in
//    ResourcesHub.jsx's own useSEO() call) — this file only ADDS the
//    missing Arabic text; it does not alter English SEO output.
//
//    The Arabic description states only what this page's own
//    already-reviewed Arabic body content says (src/i18n/ar.js's
//    hubs.resources cards: المدونة والمقالات، الأسئلة الشائعة، عن
//    الأكاديمية، معلمونا) — no invented number, price or promise beyond
//    what that body content already makes.
//
// 2) Blog.jsx ("/resources/blog") hardcoded two UI-chrome strings directly
//    in JSX rather than reading them from t.blog (which is already fully
//    localized — see src/i18n/ar.js's "blog" block): the literal 'All'
//    doubles as both the category filter's internal sentinel VALUE (used
//    in the actual filtering logic against real post categories, which
//    this fix does not touch) and its displayed button LABEL, and the
//    "No articles in this category yet." empty-state message. Both are
//    kept here, not moved into t.blog, since they are two standalone
//    strings rather than a delegated SEO description object.
export const RESOURCES_SEO_TEXT = {
  en: {
    description:
      'Explore resources from Al-Rahma Academy: blog articles, FAQ, academy information, and teacher profiles.',
  },
  ar: {
    description:
      'استكشف موارد أكاديمية الرحمة: مقالات المدونة، الأسئلة الشائعة، معلومات عن الأكاديمية، والتعرّف على معلمينا.',
  },
};

export function pickResourcesSeo(lang) {
  return RESOURCES_SEO_TEXT[lang] || RESOURCES_SEO_TEXT.en;
}

export const RESOURCES_BLOG_TEXT = {
  en: {
    categoryAll: 'All',
    emptyState: 'No articles in this category yet.',
  },
  ar: {
    categoryAll: 'الكل',
    emptyState: 'لا توجد مقالات منشورة حتى الآن.',
  },
};

export function pickResourcesBlogText(lang) {
  return RESOURCES_BLOG_TEXT[lang] || RESOURCES_BLOG_TEXT.en;
}
