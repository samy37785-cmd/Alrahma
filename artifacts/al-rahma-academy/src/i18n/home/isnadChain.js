// Home Content Foundation (2026-09-18): per-language text for the Home
// page's IsnadChain section, migrated LITERALLY (byte-for-byte) from the
// inline `CHAIN` const and surrounding JSX that used to live in
// src/components/features/marketing/IsnadChain.jsx -- no wording changed.
//
// Arabic Home Copy Implementation (2026-09-18): `ar` was added below from
// docs/home-arabic-copy-approval-pack.md's section 2, Claude editorial
// approval pending human/Islamic review where applicable (NOT a human or
// Islamic-content-reviewer sign-off) -- for every field except `quote` and
// `citation`, which at that point were still an unverified placeholder (see
// git history for that version's caution comment).
//
// IsnadChain hadith citation, Mahmoud-approved wording (2026-09-19): the
// quote is the existing hadith on the merit of learning and teaching the
// Quran; en.citation now names the specific reference (Sahih al-Bukhari
// 5027) and ar.quote/ar.citation carry the real Arabic wording and
// reference instead of the previous English-only placeholder. This is an
// editorial approval of the text/reference to publish, explicitly not a
// claim of scholarly (Islamic-scholar) sign-off, a fatwa, or an independent
// legal review -- see the approval note accompanying this change. it/es/de/fr
// are still not translated in this phase; no machine translation is added
// and none is implied to be complete.
export const ISNAD_CHAIN_TEXT = {
  en: {
    eyebrow: 'Our Legacy',
    headingLine1: 'Every lesson is connected to',
    headingLine2: '1,400 years of unbroken transmission',
    subCopy: 'When your child learns with Al-Rahma, they join a living chain — the same Quran '
      + 'recited to the Prophet ﷺ, passed down generation by generation to your home.',
    nodes: {
      prophet: {
        name: 'The Prophet ﷺ',
        detail: 'Received revelation in the Cave of Hira',
      },
      companions: {
        name: 'The Companions',
        detail: 'Memorised and transmitted word-for-word',
      },
      alAzhar: {
        name: 'Al-Azhar University',
        detail: 'Over 1,000 years of unbroken scholarship',
      },
      tutors: {
        name: 'Our Tutors',
        detail: 'Ijazah-certified with verified sanad',
      },
      child: {
        name: 'Your Child',
        detail: 'Joins a 1,400-year chain of Quran learners',
      },
    },
    quote: '"The best of you are those who learn the Quran and teach it."',
    citation: '— Sahih al-Bukhari 5027',
    ctaGift: 'Give your child this gift →',
    ctaMeet: 'Meet our Ijazah holders',
  },
  ar: {
    eyebrow: 'إرثنا',
    headingLine1: 'كل درس متصل',
    headingLine2: 'بسند متواصل عمره ١٤٠٠ عام',
    // Approval pack draft: "مع الرحمة" / "الذي تُلي على النبي ﷺ". Corrected
    // here to "مع أكاديمية الرحمة" (matches how the brand name is used in
    // running prose elsewhere on the published Arabic site, e.g. "لماذا
    // تختار الأسر أكاديمية الرحمة") and to "تُلِيَ" (correct past-tense
    // passive of "تلا", matching the English's own past tense "recited").
    subCopy: 'عندما يتعلّم طفلك مع أكاديمية الرحمة، ينضم إلى سلسلة حية — القرآن نفسه الذي تُلِيَ '
      + 'على النبي ﷺ، ونُقل جيلًا بعد جيل حتى وصل إلى بيتك.',
    nodes: {
      prophet: {
        name: 'النبي ﷺ',
        detail: 'تلقّى الوحي في غار حراء',
      },
      companions: {
        name: 'الصحابة',
        detail: 'حفظوه ونقلوه كلمة بكلمة',
      },
      alAzhar: {
        name: 'جامعة الأزهر',
        detail: 'أكثر من ١٠٠٠ عام من العلم المتصل',
      },
      tutors: {
        name: 'معلمونا',
        detail: 'حاصلون على إجازة بسند موثّق',
      },
      child: {
        name: 'طفلك',
        detail: 'ينضم إلى سلسلة عمرها ١٤٠٠ عام من متعلمي القرآن الكريم',
      },
    },
    quote: 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ',
    citation: '— صحيح البخاري ٥٠٢٧',
    ctaGift: 'امنح طفلك هذه الهدية ←',
    ctaMeet: 'تعرّف على حاملي الإجازة لدينا',
  },
};
