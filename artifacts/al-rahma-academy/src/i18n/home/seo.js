// Home page SEO metadata (2026-09-20): Home.jsx previously passed a single
// hardcoded English title/description/keywords into useSEO() with no
// lang branch at all, so <title> and meta description stayed English even
// on /ar/ while the rest of the page's body content was already Arabic.
// Live-browser review confirmed this: html lang="ar" but document.title
// and meta description in English. This file gives Home its own small
// lang-aware source, following the exact same en/ar-only + English-fallback
// shape as src/i18n/enroll/seo.js's ENROLL_SEO_TEXT/pickEnrollSeo -- only
// en/ar are real content here; it/es/de/fr fall back to the English copy
// rather than inventing unreviewed translations.
//
// Titles are deliberately short (no "— Al-Rahma Academy" / "— أكاديمية
// الرحمة" suffix): useSEO() already appends " | AL-Rahma Academy" to
// whatever title it's given (see hooks/useSEO.js's `fullTitle`). The
// previous English title ('Learn the Quran Online — Al-Rahma Academy')
// already named the academy itself, which produced a duplicated academy
// name in the real <title> tag - caught in live-browser review as "Learn
// the Quran Online — Al-Rahma Academy | AL-Rahma Academy". Same fix shape
// as the Enroll SEO title bug.
//
// Descriptions state only promises already made elsewhere on Home: 1:1
// online Quran/Tajweed/Arabic lessons, Al-Azhar certified tutors, the
// student/country trust figures (interpolated from siteFacts.js, the
// single source for those numbers -- never duplicated as separate
// literals), and one free trial lesson with no payment. No price,
// subscription, or dashboard claim, matching the existing English copy's
// scope exactly.
import { siteFacts } from '../../data/siteFacts';

export const HOME_SEO_TEXT = {
  en: {
    title: 'Learn the Quran Online',
    description: `One-to-one online Quran, Tajweed and Arabic lessons with Al-Azhar certified tutors, trusted by ${siteFacts.totalStudents} students in ${siteFacts.countriesServed} countries. One free trial lesson — no payment needed.`,
    keywords: 'learn quran online, online quran classes, quran tutor, tajweed lessons, al-azhar tutor, online islamic studies, quran for children, hifz online',
  },
  ar: {
    title: 'تعلم القرآن الكريم أونلاين',
    description: `دروس فردية مباشرة أونلاين في القرآن الكريم والتجويد واللغة العربية مع معلمين معتمدين من الأزهر، موثوق بنا من ${siteFacts.totalStudents} طالب في ${siteFacts.countriesServed} دولة. حصة تجريبية مجانية واحدة — بدون أي دفع.`,
    keywords: 'تعلم القرآن أونلاين, دروس قرآن أونلاين, معلم قرآن, دروس تجويد, معلم أزهري, دراسات إسلامية أونلاين, تعليم القرآن للأطفال, حفظ القرآن أونلاين',
  },
};

export function pickHomeSeo(lang) {
  return HOME_SEO_TEXT[lang] || HOME_SEO_TEXT.en;
}
