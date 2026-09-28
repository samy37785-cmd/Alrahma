// Hadith Library: Source Recovery, Licensed Content Integration (2026-09-18);
// Hadith Library Cleanup: Keep Only Working Collections (2026-09-18, later
// same day) -- riyadussalihin/adab/bulugh entries removed to match
// src/data/hadith/collections.js, which no longer lists those 3 books at
// all (see src/data/hadith/sources.js's HADITH_REMOVED_FROM_UI for why).
//
// Per-language author/note text for each collection card, migrated
// LITERALLY from HadithLibrary.jsx's inline isAr-forked COLLECTIONS array --
// wording unchanged except Bukhari's note, whose hadith count was corrected
// from 7,563 to 7,589 to match the live-verified count now shown everywhere
// else on this page (see src/data/hadith/sources.js). No content invented.
// French Localization Batch 1E adds `fr` author/note text for each
// collection card, a faithful translation of the English (biographical and
// bibliographic facts, not Quran/hadith text itself). it/es/de stay
// genuinely absent, matching this phase's explicit instruction not to
// start those languages for Hadith Library. Structural fields
// (id/slug/color/icon/count/label/ar) live in
// src/data/hadith/collections.js instead; source/license documentation
// lives in src/data/hadith/sources.js.
export const HADITH_COLLECTIONS_TEXT = {
  en: {
    dir: 'ltr',
    nawawi:   { author: 'Imam Yahya Al-Nawawi (d. 676 AH)', note: 'The 42 most essential hadiths — the foundation of every Muslim student' },
    qudsi:    { author: 'Various (words of Allah narrated by the Prophet ﷺ)', note: "Divine speech narrated by the Prophet ﷺ — Allah's words beyond the Quran" },
    dehlawi:  { author: 'Shah Waliullah Dehlawi (d. 1176 AH)', note: 'Selected by the great Indian Islamic scholar — covering faith, ethics and worship' },
    bukhari:  { author: 'Imam Muhammad ibn Ismail Al-Bukhari (d. 256 AH)', note: 'The most authentic book after the Quran — 7,589 hadiths, 97 books' },
    muslim:   { author: 'Imam Muslim ibn Al-Hajjaj (d. 261 AH)', note: 'The second most authentic hadith collection — praised for its superior organisation' },
    abudawud: { author: 'Imam Abu Dawud Al-Sijistani (d. 275 AH)', note: "5,274 hadiths focused on Islamic jurisprudence — the Fiqh student's essential reference" },
    tirmidhi: { author: 'Imam Muhammad Al-Tirmidhi (d. 279 AH)', note: "Notable for grading hadiths (Sahih/Hasan/Da'eef) — essential for hadith sciences" },
    ibnmajah: { author: 'Imam Ibn Majah Al-Qazwini (d. 273 AH)', note: 'The sixth of the six canonical hadith books — covers all major topics of Fiqh' },
    nasai:    { author: "Imam Ahmad An-Nasa'i (d. 303 AH)", note: "Known for its strict conditions in narrator acceptance — one of the 'Kutub Al-Sittah'" },
    malik:    { author: 'Imam Malik ibn Anas (d. 179 AH)', note: 'The earliest major hadith collection — also the foundational text of the Maliki school' },
  },
  ar: {
    dir: 'rtl',
    nawawi:   { author: 'الإمام يحيى النووي (ت ٦٧٦هـ)', note: 'الأحاديث الـ ٤٢ الأساسية — ركيزة كل طالب مسلم' },
    qudsi:    { author: 'أحاديث قدسية — كلام الله برواية النبي ﷺ', note: 'كلام الله تعالى المنقول على لسان النبي ﷺ خارج نطاق القرآن' },
    dehlawi:  { author: 'شاه ولي الله الدهلوي (ت ١١٧٦هـ)', note: 'اختيار العالم الإسلامي الهندي الكبير — يغطي العقيدة والأخلاق والعبادة' },
    bukhari:  { author: 'الإمام محمد بن إسماعيل البخاري (ت ٢٥٦هـ)', note: 'أصح كتاب بعد القرآن الكريم — ٧٥٨٩ حديثاً في ٩٧ كتاباً' },
    muslim:   { author: 'الإمام مسلم بن الحجاج (ت ٢٦١هـ)', note: 'ثاني أصح مجموعة أحاديث — مشهود له بحسن الترتيب والتنظيم' },
    abudawud: { author: 'الإمام أبو داود السجستاني (ت ٢٧٥هـ)', note: '٥٢٧٤ حديثاً تركّز على الفقه الإسلامي — المرجع الأساسي لطالب الفقه' },
    tirmidhi: { author: 'الإمام محمد الترمذي (ت ٢٧٩هـ)', note: 'مميّز بتصنيف الأحاديث (صحيح/حسن/ضعيف) — ضروري لعلوم الحديث' },
    ibnmajah: { author: 'الإمام ابن ماجه القزويني (ت ٢٧٣هـ)', note: 'السادس من الكتب الستة الصحاح — يغطي جميع الموضوعات الفقهية الكبرى' },
    nasai:    { author: 'الإمام أحمد النسائي (ت ٣٠٣هـ)', note: 'مشهور بصرامة شروطه في قبول الرواة — من الكتب الستة الصحاح' },
    malik:    { author: 'الإمام مالك بن أنس (ت ١٧٩هـ)', note: 'أقدم مجموعة حديثية كبرى — والمصدر التأسيسي للمذهب المالكي' },
  },
  fr: {
    // Hijri-era abbreviation unified to "H" (e.g. "m. 676 H"), matching the
    // convention already used in src/data/islamicStudiesData.js and
    // src/pages/CourseIjazah.jsx's French author fields -- "AH" is an
    // English/Latin abbreviation (Anno Hegirae) that does not read as
    // French. Years and every other word are unchanged.
    dir: 'ltr',
    nawawi:   { author: "L'imam Yahya Al-Nawawi (m. 676 H)", note: 'Les 42 hadiths les plus essentiels — le fondement de tout étudiant musulman' },
    qudsi:    { author: "Divers (paroles d'Allah rapportées par le Prophète ﷺ)", note: "Parole divine rapportée par le Prophète ﷺ — les paroles d'Allah au-delà du Coran" },
    dehlawi:  { author: 'Shah Waliullah Dehlawi (m. 1176 H)', note: "Choisis par le grand savant islamique indien — couvrant la foi, l'éthique et le culte" },
    bukhari:  { author: "L'imam Muhammad ibn Ismail Al-Bukhari (m. 256 H)", note: 'Le livre le plus authentique après le Coran — 7 589 hadiths, 97 livres' },
    muslim:   { author: "L'imam Muslim ibn Al-Hajjaj (m. 261 H)", note: 'Le deuxième recueil de hadiths le plus authentique — loué pour son organisation supérieure' },
    abudawud: { author: "L'imam Abu Dawud Al-Sijistani (m. 275 H)", note: "5 274 hadiths centrés sur la jurisprudence islamique — la référence essentielle pour l'étudiant en fiqh" },
    tirmidhi: { author: "L'imam Muhammad Al-Tirmidhi (m. 279 H)", note: "Reconnu pour sa classification des hadiths (sahih/hasan/da'if) — essentiel pour les sciences du hadith" },
    ibnmajah: { author: "L'imam Ibn Majah Al-Qazwini (m. 273 H)", note: 'Le sixième des six livres canoniques de hadiths — couvre tous les sujets majeurs du fiqh' },
    nasai:    { author: "L'imam Ahmad An-Nasa'i (m. 303 H)", note: "Connu pour ses conditions strictes d'acceptation des rapporteurs — l'un des « Kutub As-Sittah »" },
    malik:    { author: "L'imam Malik ibn Anas (m. 179 H)", note: "Le plus ancien grand recueil de hadiths — également le texte fondateur de l'école malikite" },
  },
};
