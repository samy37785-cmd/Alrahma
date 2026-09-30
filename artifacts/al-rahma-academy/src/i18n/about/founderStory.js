// Founder Story Arabic copy fix (Comprehensive EN/AR Audit Phase 2 +
// human-review-prep package, approved by the site owner): the "Why We
// Built Al-Rahma Academy" section inside About.jsx (the third and final
// section of the /academy/about page's body, after the already-localized
// Mission/Stats and Values sections) was 100% hardcoded English literals
// with no lang branch at all — confirmed live on /ar/academy/about at
// both desktop and mobile viewports. Same fix shape and same
// pick*(lang)-style picker as src/i18n/academy/seo.js,
// src/i18n/courses/seo.js and src/i18n/resources/content.js — only en/ar
// are real content here; it/es/de/fr are not published for this section
// and must not be claimed as such.
//
// English text is kept byte-for-byte identical to what the page already
// rendered before this change (the JSX text nodes' collapsed-whitespace
// output) — this file only ADDS the missing Arabic text; it does not
// alter English output in any way.
//
// The Arabic text below is the site owner's own explicitly-approved
// translation (verbatim, from the human-review-prep package this fix
// implements) — not a machine translation and not reworded here.
//
// body2/body3 are split into pre/strong/mid/post fragments (rather than
// one flat string) only because the ENGLISH original embeds a <strong>
// emphasis mid-sentence (body2) and two siteFacts numbers mid-sentence
// (body3) that About.jsx must keep rendering as live, dynamic
// interpolation — never a frozen/hardcoded number. The approved Arabic
// body2 text has no equivalent embedded emphasis (it was approved as
// plain prose), so its "strong" fragment is intentionally empty; Arabic
// body3 keeps the same pre/mid/post shape as English since it also
// embeds the same two dynamic siteFacts numbers, just in a different
// word order.
import { siteFacts } from '../../data/siteFacts';

export const FOUNDER_STORY_TEXT = {
  en: {
    eyebrow: 'Our Story',
    title: 'Why We Built Al-Rahma Academy',
    body1:
      'I am an Egyptian educator who moved to Europe and watched my children struggle to ' +
      'find a qualified Quran teacher — someone who could teach correctly, speak their ' +
      'language, and understand their world. Every option I found was either too expensive, ' +
      'too unreliable, or simply not qualified.',
    body2Pre:
      'That frustration became Al-Rahma Academy. We started with a handful of hand-picked ' +
      'Al-Azhar graduates and one clear rule: ',
    body2Strong: 'every tutor must be someone I would trust to teach my own children.',
    body3Pre: 'Today, ',
    body3Mid: ' families across ',
    body3Post:
      ' countries trust us with the most important thing they own — the Quran education of ' +
      'their children. Every tutor holds a verified Ijazah. Every lesson is one-to-one. Every ' +
      'family can change their tutor, pause their subscription, or request a refund — without ' +
      'any friction.',
    body4: "We didn't build a platform. We built the academy we needed and couldn't find.",
    sigLine: null, // English keeps reading `${siteFacts.founder}, Founder` directly, as before this fix.
    sigBrand: 'Al-Rahma Academy',
  },
  ar: {
    eyebrow: 'قصتنا',
    title: 'لماذا أسّسنا أكاديمية الرحمة',
    body1:
      'أنا معلّم مصري انتقلت إلى أوروبا، ورأيت أبنائي يعانون في إيجاد معلّم قرآن كريم مؤهّل — ' +
      'شخص يُحسن التعليم، ويتحدث لغتهم، ويفهم عالمهم. كل خيار وجدته كان إمّا باهظ التكلفة، ' +
      'أو غير موثوق، أو ببساطة غير مؤهّل.',
    body2Pre:
      'تحوّلت هذه المعاناة إلى أكاديمية الرحمة. بدأنا بعدد قليل من خريجي الأزهر المختارين ' +
      'بعناية، وبقاعدة واضحة: أن يكون كل معلّم شخصًا أثق به لتعليم أبنائي.',
    body2Strong: '',
    body3Pre: 'اليوم، تثق بنا ',
    body3Mid: ' أسرة في ',
    body3Post:
      ' دولة على أهم ما يملكون — تعليم أبنائهم للقرآن الكريم. كل معلّم يحمل إجازة معتمدة. ' +
      'كل حصة فردية مباشرة. وبإمكان كل أسرة تغيير معلّمها، أو إيقاف اشتراكها مؤقتًا، أو طلب ' +
      'استرداد المبلغ — دون أي تعقيد.',
    body4: 'لم نبنِ منصة إلكترونية. بل بنينا الأكاديمية التي احتجناها ولم نجدها.',
    // Owner-approved Arabic-script rendering of siteFacts.founder ('Mahmoud
    // Samy') for this signature only — not a new fact, not a change to
    // siteFacts.js itself, which stays the single source for the
    // Latin-script name used everywhere else. Kept as one pre-punctuated
    // string (rather than spliced with a hardcoded Latin comma) so the
    // Arabic comma "،" is exactly what was approved.
    sigLine: 'محمود سامي، المؤسس',
    sigBrand: 'Al-Rahma Academy', // Brand name — deliberately identical in both languages.
  },
  // French Localization Batch 1A: a faithful French translation of the
  // English story above (English is the canonical source for French) — no
  // event, claim, figure or promise added, and the same <strong> fragment
  // and siteFacts numbers. The owner may review it before merge.
  fr: {
    eyebrow: 'Notre histoire',
    title: 'Pourquoi nous avons créé Al-Rahma Academy',
    body1:
      "Je suis un éducateur égyptien installé en Europe, et j'ai vu mes enfants peiner à " +
      "trouver un enseignant du Coran qualifié — quelqu'un capable d'enseigner correctement, " +
      'de parler leur langue et de comprendre leur monde. Chaque option que je trouvais était ' +
      'soit trop chère, soit peu fiable, soit tout simplement pas qualifiée.',
    body2Pre:
      'Cette frustration est devenue Al-Rahma Academy. Nous avons commencé avec une poignée de ' +
      "diplômés d'Al-Azhar choisis avec soin et une règle claire : ",
    body2Strong: "chaque enseignant doit être quelqu'un à qui je confierais l'enseignement de mes propres enfants.",
    body3Pre: "Aujourd'hui, ",
    body3Mid: ' familles dans ',
    body3Post:
      " pays nous confient ce qu'elles ont de plus précieux — l'éducation coranique de leurs " +
      'enfants. Chaque enseignant détient une ijaza vérifiée. Chaque cours est individuel. ' +
      "Chaque famille peut changer d'enseignant, suspendre son abonnement ou demander un " +
      'remboursement — sans aucune complication.',
    body4: "Nous n'avons pas créé une plateforme. Nous avons créé l'académie dont nous avions besoin et que nous ne trouvions pas.",
    sigLine: `${siteFacts.founder}, fondateur`,
    sigBrand: 'Al-Rahma Academy',
  },
  // Italian SEO Publication Gate (2026-09-30): a faithful Italian
  // translation of the English story above (English is the canonical
  // source for Italian) — no event, claim, figure or promise added, same
  // pre/strong/mid/post shape and same live siteFacts numbers as every
  // other language here. Owner may review before merge.
  it: {
    eyebrow: 'La nostra storia',
    title: 'Perché abbiamo creato Al-Rahma Academy',
    body1:
      'Sono un educatore egiziano trasferitosi in Europa, e ho visto i miei figli faticare a ' +
      'trovare un insegnante di Corano qualificato — qualcuno capace di insegnare ' +
      'correttamente, di parlare la loro lingua e di comprendere il loro mondo. Ogni opzione ' +
      'che trovavo era o troppo costosa, o inaffidabile, o semplicemente non qualificata.',
    body2Pre:
      'Questa frustrazione è diventata Al-Rahma Academy. Abbiamo iniziato con un piccolo ' +
      "gruppo di laureati di Al-Azhar scelti con cura e una regola chiara: ",
    body2Strong: "ogni insegnante deve essere qualcuno a cui affiderei l'educazione dei miei stessi figli.",
    body3Pre: 'Oggi, ',
    body3Mid: ' famiglie in ',
    body3Post:
      " paesi ci affidano ciò che hanno di più prezioso — l'educazione coranica dei loro figli. " +
      "Ogni insegnante possiede un'Ijazah verificata. Ogni lezione è individuale. Ogni famiglia " +
      'può cambiare insegnante, sospendere il proprio abbonamento o richiedere un rimborso — ' +
      'senza alcuna complicazione.',
    body4: "Non abbiamo costruito una piattaforma. Abbiamo costruito l'accademia di cui avevamo bisogno e che non riuscivamo a trovare.",
    sigLine: `${siteFacts.founder}, fondatore`,
    sigBrand: 'Al-Rahma Academy',
  },
};

export function pickFounderStory(lang) {
  return FOUNDER_STORY_TEXT[lang] || FOUNDER_STORY_TEXT.en;
}
