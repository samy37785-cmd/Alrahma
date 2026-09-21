// Academy hub SEO metadata (2026-09-21): AcademyHub.jsx ("/academy") called
// useSEO() with a hardcoded English description literal and no lang branch
// at all, so meta description stayed English on /ar/academy while the
// rest of the page's body content (t.hubs.academy) was already Arabic.
// Same fix shape as src/i18n/home/seo.js and src/i18n/courses/seo.js — only
// en/ar are real content here; it/es/de/fr are not published for this page
// and must not be claimed as such.
//
// The title is left untouched by this file (AcademyHub.jsx keeps its
// existing `title: t.nav.academy`, already correctly localized) — only the
// description was English-only, so only the description moves here.
//
// English description text is kept byte-for-byte identical to what the
// page already rendered before this change (previously inline in
// AcademyHub.jsx's own useSEO() call) — this file only ADDS the missing
// Arabic text; it does not alter English SEO output.
//
// The Arabic description states only what this page's own already-reviewed
// Arabic body content says (src/i18n/ar.js's hubs.academy: eyebrow "أكاديمية
// الرحمة", and the four card titles/descriptions — مهمتنا/تاريخنا/منهجيتنا،
// معلمونا، سياسة الخصوصية، حصة تجريبية مجانية بدون دفع) — no invented
// number, certification or promise beyond what that body content already
// makes.
export const ACADEMY_SEO_TEXT = {
  en: {
    description:
      'Learn about Al-Rahma Academy — our mission, teachers, policies, and how to get started with a free trial lesson.',
  },
  ar: {
    description:
      'تعرّف على أكاديمية الرحمة — مهمتنا، معلمونا، سياساتنا، وكيفية البدء بحصة تجريبية مجانية.',
  },
};

export function pickAcademySeo(lang) {
  return ACADEMY_SEO_TEXT[lang] || ACADEMY_SEO_TEXT.en;
}
