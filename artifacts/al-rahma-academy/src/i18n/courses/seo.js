// Courses hub SEO metadata (2026-09-21): CoursesHub.jsx, CoursesQuran.jsx and
// CoursesArabic.jsx each called useSEO() with a title/description that was
// either a plain nav-label reuse or a hardcoded English literal, with no
// lang branch at all — so <title> and meta description stayed English on
// /ar/courses, /ar/courses/quran and /ar/courses/arabic while the rest of
// each page's body content was already Arabic. Live-browser review
// confirmed this: html lang="ar" but document.title and meta description
// in English. Same fix shape, and same en/ar-only + English-fallback
// convention, as src/i18n/home/seo.js and src/i18n/enroll/seo.js — only
// en/ar are real content here; it/es/de/fr are not published for these
// pages and must not be claimed as such.
//
// Titles are deliberately short (no "— Al-Rahma Academy" / "— أكاديمية
// الرحمة" suffix): useSEO() already appends " | AL-Rahma Academy" to
// whatever title it's given (see hooks/useSEO.js's `fullTitle`) — adding
// the academy name again here would duplicate it in the real <title> tag,
// the exact bug already fixed once for Home and Enroll.
//
// English title/description text is kept byte-for-byte identical to what
// each page already rendered before this change (previously inline in
// each page's own useSEO() call) — this file only ADDS the missing Arabic
// text and a keywords field neither page passed before; it does not alter
// English SEO output.
//
// Arabic descriptions state only what each course's own already-reviewed
// Arabic body content says (src/i18n/ar.js's hubs.courses/quran/arabic —
// course names, teacher credential, format), with no invented number,
// certification or promise beyond what that body content already makes.
// The one number used (28 Arabic letters) is the same figure already
// stated in both the English and Arabic body copy on the Arabic Alphabet
// page itself, not a new claim.
//
// French Localization Batch 1A: each `fr` entry is a faithful translation
// of the English entry beside it (the "17 languages" and "28 letters"
// figures are the English source's own). French is still unpublished for
// SEO: no sitemap, hreflang or prerender entry.
export const COURSES_SEO_TEXT = {
  hub: {
    en: {
      title: 'Courses',
      description:
        'Explore all online Quran and Islamic courses at Al-Rahma Academy — Tajweed, Hifz, Ijazah, Islamic Studies, Arabic Alphabet, and more.',
      keywords:
        'online quran courses, tajweed course, hifz program, quran ijazah, islamic studies online, arabic alphabet course, al-azhar certified teachers',
    },
    ar: {
      title: 'الدورات',
      description:
        'استكشف جميع دورات القرآن والعلوم الإسلامية أونلاين في أكاديمية الرحمة — تلاوة القرآن والتجويد، الحفظ، إجازة القرآن، الدراسات الإسلامية، الحروف العربية، والمزيد.',
      keywords:
        'دورات قرآن أونلاين, دورة تجويد, برنامج حفظ القرآن, إجازة القرآن, دراسات إسلامية أونلاين, دورة الحروف العربية, معلمون معتمدون من الأزهر',
    },
    fr: {
      title: 'Cours',
      description:
        "Découvrez tous les cours de Coran et de sciences islamiques en ligne d'Al-Rahma Academy — tajwid, hifz, ijaza, études islamiques, alphabet arabe et plus encore.",
      keywords:
        "cours de coran en ligne, cours de tajwid, programme de hifz, ijaza du coran, études islamiques en ligne, cours d'alphabet arabe, enseignants certifiés al-azhar",
    },
    // Italian Batch 1A: faithful translation of the English entry above,
    // reusing it.js's own established course names (nav.quranTajweed,
    // nav.hifzMem, nav.quranIjazah, nav.islamicStudies, nav.arabicAlphabet)
    // for consistency. Ordinary marketing copy only. Italian still
    // unpublished for SEO.
    it: {
      title: 'Corsi',
      description:
        'Scopri tutti i corsi online di Corano e scienze islamiche di Al-Rahma Academy — Tajweed, Hifz, Ijazah, Studi Islamici, Alfabeto Arabo e altro ancora.',
      keywords:
        'corsi di corano online, corso di tajweed, programma hifz, ijazah del corano, studi islamici online, corso di alfabeto arabo, insegnanti certificati al-azhar',
    },
  },
  quran: {
    en: {
      title: 'Quran & Tajweed Courses',
      description:
        'Online Quran Reading, Tajweed, and Hifz (memorization) courses with certified Al-Azhar teachers — in 17 languages.',
      keywords:
        'quran reading course, tajweed course online, quran memorization, hifz course, al-azhar quran teacher, quran recitation lessons',
    },
    ar: {
      title: 'دورات القرآن والتجويد',
      description:
        'دروس أونلاين في تلاوة القرآن والتجويد وحفظ القرآن الكريم مع معلمين معتمدين من الأزهر — دروس فردية مباشرة ترافقك خطوة بخطوة حتى إتقان التلاوة الصحيحة.',
      keywords:
        'دورة تلاوة القرآن, دورة تجويد أونلاين, حفظ القرآن الكريم, دورة حفظ, معلم قرآن أزهري, دروس تلاوة القرآن',
    },
    fr: {
      title: 'Cours de Coran et de tajwid',
      description:
        'Cours en ligne de lecture du Coran, de tajwid et de hifz (mémorisation) avec des enseignants certifiés par Al-Azhar — en 17 langues.',
      keywords:
        'cours de lecture du coran, cours de tajwid en ligne, mémorisation du coran, cours de hifz, professeur de coran al-azhar, cours de récitation du coran',
    },
    // Italian Batch 1A: faithful translation of the English entry above
    // (same "17 languages" figure, the English source's own). Matches
    // it.js's own hubs.quran.heading ("Corsi di Corano e Tajweed")
    // exactly. Ordinary marketing copy only. Italian still unpublished
    // for SEO.
    it: {
      title: 'Corsi di Corano e Tajweed',
      description:
        'Corsi online di lettura del Corano, Tajweed e Hifz (memorizzazione) con insegnanti certificati Al-Azhar — in 17 lingue.',
      keywords:
        'corso di lettura del corano, corso di tajweed online, memorizzazione del corano, corso di hifz, insegnante di corano al-azhar, lezioni di recitazione del corano',
    },
  },
  arabic: {
    en: {
      title: 'Arabic Alphabet Course',
      description:
        'Learn the 28 Arabic letters with audio pronunciation and interactive exercises — ideal for beginners starting their Quran journey.',
      keywords:
        'arabic alphabet course, learn arabic letters, arabic pronunciation, arabic for beginners, quran arabic alphabet',
    },
    ar: {
      title: 'دورة الحروف العربية',
      description:
        'تعلّم الحروف العربية الـ28 مع النطق الصوتي وتمارين تفاعلية مباشرة في المتصفح — الخطوة الأولى المثالية قبل قراءة القرآن الكريم.',
      keywords:
        'دورة الحروف العربية, تعلم الحروف العربية, نطق الحروف العربية, العربية للمبتدئين, حروف القرآن العربية',
    },
    fr: {
      title: "Cours d'alphabet arabe",
      description:
        'Apprenez les 28 lettres arabes avec la prononciation audio et des exercices interactifs — idéal pour les débutants qui commencent leur parcours avec le Coran.',
      keywords:
        "cours d'alphabet arabe, apprendre les lettres arabes, prononciation arabe, arabe pour débutants, alphabet arabe du coran",
    },
    // Italian Batch 1A: faithful translation of the English entry above
    // (same "28 letters" figure, the English source's own). Ordinary
    // marketing copy only. Italian still unpublished for SEO.
    it: {
      title: 'Corso di Alfabeto Arabo',
      description:
        'Impara le 28 lettere arabe con pronuncia audio ed esercizi interattivi — ideale per chi inizia il proprio percorso con il Corano.',
      keywords:
        'corso di alfabeto arabo, imparare le lettere arabe, pronuncia araba, arabo per principianti, alfabeto arabo del corano',
    },
  },
};

export function pickCoursesSeo(route, lang) {
  const forRoute = COURSES_SEO_TEXT[route];
  return forRoute[lang] || forRoute.en;
}
