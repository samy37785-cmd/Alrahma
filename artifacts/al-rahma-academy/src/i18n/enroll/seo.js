// Enroll page SEO metadata (2026-09-20): Enroll.jsx previously passed a
// single hardcoded English title/description/keywords into useSEO() with
// no isAr/lang branch at all, so <title> and meta description stayed
// English even on /ar/enroll while the rest of the page (labels, h1, form)
// was already fully Arabic. Live-browser review confirmed this: html
// lang="ar" but document.title in English. This file gives Enroll its own
// small lang-aware source, following the same en/ar-only + English-fallback
// shape as src/i18n/home/leakedStrings.js's pickLeakedString() -- only en/ar
// are real content here; it/es/de/fr fall back to the English copy rather
// than inventing unreviewed translations.
//
// Copy is deliberately literal about the actual booking flow (Booking-First
// Enrollment -- see docs/current-project-status.md §5): a free trial
// request, not an instant payment, subscription, or account/dashboard.
// Titles below are deliberately short (no "— Enroll at Al-Rahma Academy" /
// "— التسجيل في أكاديمية الرحمة" suffix): useSEO() already appends
// " | AL-Rahma Academy" to whatever title it's given (see
// hooks/useSEO.js's `fullTitle`), so a title that names the academy itself
// produced a duplicated academy name in the real <title> tag - caught in
// live-browser review as "…Enroll at Al-Rahma Academy | AL-Rahma Academy".
export const ENROLL_SEO_TEXT = {
  en: {
    title: 'Book Free Trial Lessons',
    description: 'One free one-to-one Quran trial lesson — no payment, no commitment. Choose your subjects, pick an Al-Azhar certified tutor, and book your plan — we\'ll confirm your schedule and payment with you on WhatsApp.',
    keywords: 'free quran trial lesson, online quran enrollment, book quran lesson, quran class booking',
  },
  ar: {
    title: 'احجز حصة تجريبية مجانية',
    description: 'حصة تجريبية مجانية فردية في القرآن الكريم — بلا دفع وبلا التزام. اختر موادك، واختر معلمًا معتمدًا من الأزهر، وأرسل طلب حجز خطتك — سيتواصل فريقنا معك عبر واتساب لتأكيد الموعد والدفع.',
    keywords: 'حصة تجريبية مجانية للقرآن, تسجيل تعلم القرآن أونلاين, حجز حصة قرآن, حجز دورة قرآن',
  },
};

export function pickEnrollSeo(lang) {
  return ENROLL_SEO_TEXT[lang] || ENROLL_SEO_TEXT.en;
}
