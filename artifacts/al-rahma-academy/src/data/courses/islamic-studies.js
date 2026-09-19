// Structural (language-agnostic) data for /courses/islamic-studies: ids,
// icons, colors, links, and raw-Arabic text that is always shown regardless
// of the visitor's language. Mirrors src/data/courses/ijazah.js's pattern
// (Phase 2b). Per-language body text lives in
// src/i18n/courses/islamic-studies.js, keyed by the same ids used here.
//
// ISLAMIC_STUDIES_HADITHS order matters: CourseIslamicStudies.jsx's
// "hadith of the day" logic indexes this array by position
// (dayOfYear % length), it does not look up by id.

export const ISLAMIC_STUDIES_HADITHS = [
  { id: 'nawawi-1', arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ', url: 'https://sunnah.com/nawawi40:1' },
  { id: 'nawawi-2', arabic: 'الإِحْسَانُ أَنْ تَعْبُدَ اللَّهَ كَأَنَّكَ تَرَاهُ', url: 'https://sunnah.com/nawawi40:2' },
  { id: 'nawawi-3', arabic: 'بُنِيَ الإِسْلَامُ عَلَى خَمْسٍ', url: 'https://sunnah.com/nawawi40:3' },
  { id: 'nawawi-4', arabic: 'إِنَّ أَحَدَكُمْ يُجْمَعُ خَلْقُهُ فِي بَطْنِ أُمِّهِ', url: 'https://sunnah.com/nawawi40:4' },
  { id: 'nawawi-6', arabic: 'إِنَّ الْحَلَالَ بَيِّنٌ وَإِنَّ الْحَرَامَ بَيِّنٌ', url: 'https://sunnah.com/nawawi40:6' },
  { id: 'nawawi-7', arabic: 'الدِّينُ النَّصِيحَةُ', url: 'https://sunnah.com/nawawi40:7' },
  { id: 'nawawi-10', arabic: 'إِنَّ اللَّهَ طَيِّبٌ لَا يَقْبَلُ إِلَّا طَيِّبًا', url: 'https://sunnah.com/nawawi40:10' },
  { id: 'nawawi-11', arabic: 'دَعْ مَا يَرِيبُكَ إِلَى مَا لَا يَرِيبُكَ', url: 'https://sunnah.com/nawawi40:11' },
  { id: 'nawawi-12', arabic: 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ تَرْكُهُ مَا لَا يَعْنِيهِ', url: 'https://sunnah.com/nawawi40:12' },
  { id: 'nawawi-13', arabic: 'لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ', url: 'https://sunnah.com/nawawi40:13' },
  { id: 'nawawi-16', arabic: 'لَا تَغْضَبْ', url: 'https://sunnah.com/nawawi40:16' },
  { id: 'nawawi-18', arabic: 'اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ', url: 'https://sunnah.com/nawawi40:18' },
  { id: 'nawawi-19', arabic: 'احْفَظِ اللَّهَ يَحْفَظْكَ', url: 'https://sunnah.com/nawawi40:19' },
  { id: 'nawawi-23', arabic: 'الطُّهُورُ شَطْرُ الإِيمَانِ', url: 'https://sunnah.com/nawawi40:23' },
  { id: 'nawawi-34', arabic: 'مَنْ رَأَى مِنْكُمْ مُنْكَرًا فَلْيُغَيِّرْهُ بِيَدِهِ', url: 'https://sunnah.com/nawawi40:34' },
  { id: 'nawawi-40', arabic: 'كُنْ فِي الدُّنْيَا كَأَنَّكَ غَرِيبٌ أَوْ عَابِرُ سَبِيلٍ', url: 'https://sunnah.com/nawawi40:40' },
  { id: 'tabarani-khair-annas', arabic: 'خَيْرُ النَّاسِ أَنْفَعُهُمْ لِلنَّاسِ', url: 'https://sunnah.com/nawawi40' },
];

export const ISLAMIC_STUDIES_MODULES = [
  { id: 'aqeedah', num: '01', icon: '🌟', color: '#0b6e4f', sourceAr: 'العقيدة في ضوء الكتاب والسنة' },
  { id: 'fiqh', num: '02', icon: '🕌', color: '#1a5fa0', sourceAr: 'الفقه الميسر في ضوء الكتاب والسنة' },
  { id: 'seerah', num: '03', icon: '📖', color: '#7a3a8a', sourceAr: 'الرحيق المختوم' },
  { id: 'hadith-ethics', num: '04', icon: '📜', color: '#c07020', sourceAr: 'الأربعون النووية' },
  { id: 'tafsir', num: '05', icon: '✨', color: '#2a6a80', sourceAr: 'التفسير الميسر' },
];

export const ISLAMIC_STUDIES_BOOKS = [
  { id: 'islamic-creed-series', icon: '📗', title: 'Islamic Creed Series', ar: 'العقيدة في ضوء الكتاب والسنة', link: null },
  { id: 'fiqh-al-muyassar', icon: '📘', title: 'Al-Fiqh Al-Muyassar', ar: 'الفقه الميسر في ضوء الكتاب والسنة', link: null },
  { id: 'bulugh-al-maram', icon: '📙', title: 'Bulugh Al-Maram', ar: 'بلوغ المرام من أدلة الأحكام', link: 'https://sunnah.com/bulugh' },
  { id: 'sealed-nectar', icon: '📕', title: 'The Sealed Nectar (Ar-Raheeq Al-Makhtum)', ar: 'الرحيق المختوم', link: null },
  { id: 'shamail', icon: '📔', title: "Ash-Shama'il Al-Muhammadiyah", ar: 'الشمائل المحمدية', link: 'https://sunnah.com/shamail' },
  { id: 'arbaeen-nawawiyyah', icon: '📒', title: "Al-Arba'een Al-Nawawiyyah", ar: 'الأربعون النووية', link: 'https://sunnah.com/nawawi40' },
  { id: 'riyad-as-saliheen', icon: '📓', title: 'Riyad As-Salihin', ar: 'رياض الصالحين', link: 'https://sunnah.com/riyadussalihin' },
  { id: 'adab-al-mufrad', icon: '📋', title: 'Al-Adab Al-Mufrad', ar: 'الأدب المفرد', link: 'https://sunnah.com/adab' },
  { id: 'tafsir-al-muyassar', icon: '✨', title: 'Al-Tafsir Al-Muyassar', ar: 'التفسير الميسر', link: 'https://quran.com' },
];
