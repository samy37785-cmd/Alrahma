// Home Content Foundation (2026-09-18): per-language text for the Home
// page's LevelQuiz section, migrated LITERALLY (byte-for-byte) from the
// inline `STEPS`/`RECOMMENDATIONS` consts that used to live in
// src/components/features/marketing/LevelQuiz.jsx -- no wording changed.
//
// Arabic Home Copy Implementation (2026-09-18): `ar` was added below from
// docs/home-arabic-copy-approval-pack.md's section 1, after a Claude
// editorial pass (grammar/fluency fixes noted inline where the shipped
// wording differs from that file's draft). This is Claude editorial
// approval pending human/Islamic review where applicable -- NOT a human or
// Islamic-content-reviewer sign-off. it/es/de/fr still stay absent; no
// wording for them is invented here. See src/data/translationStatus.js for
// why '/' stays 'legacy' for `ar` (and every other non-English language)
// regardless of this addition.
export const LEVEL_QUIZ_TEXT = {
  en: {
    eyebrow: 'Find your course',
    heading: '3 questions → your perfect lesson plan',
    steps: {
      arabic: {
        question: 'Can your child / you read Arabic?',
        options: {
          none: 'Not yet — starting from zero',
          basic: 'A few letters — needs practice',
          fluent: 'Yes, can read Arabic',
        },
      },
      goal: {
        question: 'What is your main goal?',
        options: {
          read: 'Learn to read the Quran correctly',
          memorize: 'Memorize the Quran (Hifz)',
          ijazah: 'Earn an Ijazah certification',
          islamic: 'Islamic Studies / Arabic',
        },
      },
      who: {
        question: 'Who is this for?',
        options: {
          child: 'My child (under 12)',
          teen: 'My teenager (12–17)',
          adult: 'Myself (adult)',
          family: 'Multiple family members',
        },
      },
    },
    recommendations: {
      read: {
        title: 'Quran Reading — Noorani Qaida',
        desc: 'Start from the very first letter. Our tutors take complete beginners to confident Quran reading in 4–6 months.',
        badge: '🌱 Perfect for beginners',
      },
      memorize: {
        title: 'Quran Memorization (Hifz)',
        desc: 'A structured Hifz plan with daily revision, spaced repetition, and personal accountability — for all ages.',
        badge: '🏆 Most popular course',
      },
      ijazah: {
        title: 'Quran Ijazah Course',
        desc: 'Receive an Ijazah with a connected chain (sanad) back to the Prophet ﷺ — taught by Ijazah-holders themselves.',
        badge: '📜 Advanced certification',
      },
      islamic: {
        title: 'Islamic Studies & Arabic',
        desc: 'Aqeedah, Fiqh, Seerah, Hadith, Tafsir — plus foundational Arabic — in your language.',
        badge: '🌍 All levels welcome',
      },
    },
    resultEyebrow: 'Your personalised recommendation',
    startTrialBtn: 'Start free trial — no card needed',
    learnMoreBtn: 'Learn more about this course',
    retakeBtn: '← Retake quiz',
  },
  // Claude editorial approval pending human/Islamic review where
  // applicable (see docs/home-arabic-copy-approval-pack.md section 1 for
  // the reviewed draft; two differences from that draft, made during this
  // editorial pass, are noted below):
  ar: {
    eyebrow: 'دورتك المناسبة',
    heading: '3 أسئلة ← خطة دروسك المثالية',
    steps: {
      arabic: {
        question: 'هل يستطيع طفلك / تستطيع أنت قراءة العربية؟',
        options: {
          none: 'ليس بعد — البداية من الصفر',
          basic: 'بضعة حروف — يحتاج إلى تدريب',
          fluent: 'نعم، يستطيع قراءة العربية',
        },
      },
      goal: {
        question: 'ما هو هدفك الرئيسي؟',
        options: {
          read: 'تعلّم قراءة القرآن الكريم بشكل صحيح',
          memorize: 'حفظ القرآن الكريم',
          ijazah: 'الحصول على إجازة معتمدة',
          islamic: 'الدراسات الإسلامية / اللغة العربية',
        },
      },
      who: {
        question: 'لمن هذه الدورة؟',
        options: {
          child: 'طفلي (أقل من 12 عامًا)',
          // Approval pack draft was "ابني/ابنتي المراهق(ة) (12–17 عامًا)" --
          // simplified here to match the "طفلي ..." construction used by
          // the other 3 options in this same question, for a more
          // consistent, less cluttered set of 4 parallel choices.
          teen: 'طفلي المراهق (12–17 عامًا)',
          adult: 'لنفسي (بالغ)',
          family: 'أكثر من فرد في الأسرة',
        },
      },
    },
    recommendations: {
      read: {
        title: 'قراءة القرآن — القاعدة النورانية',
        // Approval pack draft used "حتى يقرأوا ... بثقة" (a verb clause);
        // rewritten as a noun phrase ("وصولًا إلى قراءة واثقة") to mirror
        // the English source's own noun-phrase structure ("to confident
        // Quran reading") and read more fluently in MSA.
        desc: 'ابدأ من أول حرف. يرافق معلمونا المبتدئين تمامًا وصولًا إلى قراءة واثقة للقرآن الكريم خلال 4–6 أشهر.',
        badge: '🌱 مثالي للمبتدئين',
      },
      memorize: {
        title: 'حفظ القرآن الكريم',
        desc: 'خطة حفظ منظمة مع مراجعة يومية وتكرار متباعد ومتابعة شخصية — لجميع الأعمار.',
        badge: '🏆 الدورة الأكثر طلبًا',
      },
      ijazah: {
        title: 'دورة إجازة القرآن الكريم',
        desc: 'احصل على إجازة بسند متصل إلى النبي ﷺ — بتدريس من حاملي الإجازة أنفسهم.',
        badge: '📜 شهادة متقدمة',
      },
      islamic: {
        title: 'الدراسات الإسلامية واللغة العربية',
        desc: 'العقيدة والفقه والسيرة والحديث والتفسير — إلى جانب أساسيات اللغة العربية — بلغتك.',
        badge: '🌍 لكل المستويات',
      },
    },
    resultEyebrow: 'توصيتك الشخصية',
    startTrialBtn: 'ابدأ تجربة مجانية — دون الحاجة لبطاقة',
    // Approval pack draft: "مزيد من التفاصيل عن هذه الدورة". Rewritten to
    // reuse the same "تعرّف على ..." verb already used for IsnadChain's
    // ctaMeet, for a more consistent CTA voice across Home.
    learnMoreBtn: 'تعرّف على المزيد حول هذه الدورة',
    // Approval pack draft kept the English source's "←" literally and
    // flagged it as a style question. Flipped to "→" here: this button
    // means "go back to the start of the quiz", and in RTL reading order
    // "backward" points right, not left -- "←" would read as pointing
    // further forward, the wrong direction for a restart action.
    retakeBtn: '→ إعادة الاختبار',
  },
};
