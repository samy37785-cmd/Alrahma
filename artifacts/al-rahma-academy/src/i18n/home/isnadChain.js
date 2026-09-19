// Home Content Foundation (2026-09-18): per-language text for the Home
// page's IsnadChain section, migrated LITERALLY (byte-for-byte) from the
// inline `CHAIN` const and surrounding JSX that used to live in
// src/components/features/marketing/IsnadChain.jsx -- no wording changed.
//
// EN ONLY, on purpose -- and this is the one section on Home where that
// matters most. IsnadChain.jsx never had an `isAr` fork or any other
// non-English content anywhere in this codebase (confirmed by search before
// this migration): there is no pre-existing Arabic text to carry over.
//
// The Hadith quote (`quote`/`citation` below) is NOT translated into Arabic
// here, and MUST NOT be treated as a small leftover detail: per explicit
// instruction, this repo does not author a new translation or a new
// religious attribution for a Hadith, and does not invent one. Before any
// language adds real content to this module, a human must supply, with a
// verifiable source:
//   1. The exact book/chapter/hadith-number reference this quote is drawn
//      from (the current English wording and "— Sahih Al-Bukhari" citation
//      predate this migration and are carried over unchanged, not verified
//      or added by this migration).
//   2. The standard transmitted Arabic wording of that Hadith (not a fresh
//      translation back from the English paraphrase above).
//   3. it/es/de/fr text translated from/against that verified Arabic
//      original, not from this English paraphrase.
// See docs/home-copy-review-pack.md, "Row 3.14 — Hadith sourcing note" for
// the fuller version of this same caution.
//
// Arabic Home Copy Implementation (2026-09-18): `ar` was added below from
// docs/home-arabic-copy-approval-pack.md's section 2, Claude editorial
// approval pending human/Islamic review where applicable (NOT a human or
// Islamic-content-reviewer sign-off) -- for every field EXCEPT `quote` and
// `citation`. ar.quote/ar.citation are set to the exact same English
// strings as en.quote/en.citation, on purpose: this object must be
// structurally complete (no missing key ever reaches the component as
// `undefined`), and per instruction the Hadith itself is left exactly as
// it is -- not translated, not hidden, not altered in behavior. A visitor
// on /ar/ will still see this one quote and its citation in English until
// a human supplies the three items listed above. This is a known,
// deliberately unresolved gap, not an oversight.
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
    // Not a verified citation and not an authored translation -- carried
    // over unchanged from the pre-migration component. See the module
    // comment above before adding any other language here.
    quote: '"The best of you are those who learn the Quran and teach it."',
    citation: '— Sahih Al-Bukhari',
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
    // Deliberately identical to en.quote/en.citation -- see the module
    // comment above. NOT a translation, NOT a religious attribution
    // authored or verified by this migration.
    quote: '"The best of you are those who learn the Quran and teach it."',
    citation: '— Sahih Al-Bukhari',
    ctaGift: 'امنح طفلك هذه الهدية ←',
    ctaMeet: 'تعرّف على حاملي الإجازة لدينا',
  },
};
