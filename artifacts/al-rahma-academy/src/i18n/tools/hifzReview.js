// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Per-language shell text for /tools/hifz-review, migrated LITERALLY from
// HifzReviewPage.jsx's inline isAr-forked strings -- no content added,
// changed, or reworded. `quality.*` is new: the review-quality buttons
// (Perfect/Good/OK/Hard/Forgot) were previously hardcoded English with NO
// isAr fork at all (shown as English even on the Arabic page) -- these are
// generic self-assessment UI words, not religious content, so real Arabic
// values are added here rather than left English-only. The SM-2 algorithm,
// card data (surah/verse/Arabic text/hint), and localStorage key are
// untouched tool logic/content, not part of this migration.
//
// `done.summary` and `overview.startSession` use literal `{count}`/
// `{plural}` tokens, replaced via plain string .replace() in the page
// component -- this preserves the exact original per-language behaviour
// (English pluralizes "verse/card", Arabic does not) without any
// isAr/lang-based branching in the component.
//
// French Localization Batch 1E adds `fr`, translated from the English
// shell only. it/es/de stay genuinely absent; the route stays 'legacy' in
// translationStatus.js for those (see that file's own comment).
export const HIFZ_REVIEW_TEXT = {
  en: {
    seo: {
      title: 'Hifz Spaced Repetition',
      description: 'Review your Hifz using SM-2 spaced repetition to commit Quran to long-term memory',
    },
    breadcrumbs: { tools: 'Tools', current: 'Hifz Review' },
    eyebrow: 'Spaced Repetition',
    hero: {
      title: 'Hifz Review',
      sub: 'Review your memorisation with the SM-2 algorithm for long-term retention',
    },
    overview: {
      dueToday: 'Due today',
      reviewed: 'Reviewed',
      totalCards: 'Total cards',
      startSession: 'Start review session ({count} card{plural})',
      allCaughtUp: "You're all caught up! No cards due right now. Check back later.",
      verseAbbrev: 'v.',
      due: 'Due',
      resetAll: 'Reset all cards',
    },
    session: {
      verse: 'Verse',
      hintLabel: '(beginning of the verse…)',
      showVerse: 'Show verse',
      qualityLabel: 'How did you do?',
    },
    done: {
      title: 'Session complete — well done!',
      summary: 'You reviewed {count} verse{plural}. Cards will return on their scheduled dates.',
      backToOverview: 'Back to overview',
    },
    quality: { perfect: 'Perfect', good: 'Good', ok: 'OK', hard: 'Hard', forgot: 'Forgot' },
  },
  ar: {
    seo: {
      title: 'مراجعة الحفظ بالتكرار المتباعد',
      description: 'راجع محفوظاتك بنظام التكرار المتباعد SM-2 لتثبيت القرآن الكريم في الذاكرة',
    },
    breadcrumbs: { tools: 'الأدوات', current: 'مراجعة الحفظ' },
    eyebrow: 'التكرار المتباعد',
    hero: {
      title: 'مراجعة الحفظ',
      sub: 'راجع محفوظاتك بنظام SM-2 لتثبيتها في الذاكرة طويلة المدى',
    },
    overview: {
      dueToday: 'تستحق المراجعة اليوم',
      reviewed: 'تمت مراجعتها',
      totalCards: 'إجمالي البطاقات',
      startSession: 'ابدأ المراجعة ({count} آية)',
      allCaughtUp: 'رائع! لا توجد بطاقات مستحقة الآن. عد لاحقاً.',
      verseAbbrev: 'آية',
      due: 'مستحقة',
      resetAll: 'إعادة ضبط جميع البطاقات',
    },
    session: {
      verse: 'الآية',
      hintLabel: '(ابدأ الآية…)',
      showVerse: 'اكشف الآية',
      qualityLabel: 'كيف كانت إجابتك؟',
    },
    done: {
      title: 'أحسنت! جلسة المراجعة اكتملت',
      summary: 'راجعت {count} آية. ستعود البطاقات في مواعيدها المجدولة.',
      backToOverview: 'العودة للرئيسية',
    },
    quality: { perfect: 'ممتاز', good: 'جيد', ok: 'مقبول', hard: 'صعب', forgot: 'نسيت' },
  },
  fr: {
    seo: {
      title: 'Répétition espacée du hifz',
      description: "Révisez votre hifz avec la répétition espacée SM-2 pour ancrer le Coran dans la mémoire à long terme",
    },
    breadcrumbs: { tools: 'Outils', current: 'Révision du hifz' },
    eyebrow: 'Répétition espacée',
    hero: {
      title: 'Révision du hifz',
      sub: "Révisez votre mémorisation avec l'algorithme SM-2 pour une rétention à long terme",
    },
    overview: {
      dueToday: "À réviser aujourd'hui",
      reviewed: 'Révisées',
      totalCards: 'Total des cartes',
      startSession: 'Commencer la session ({count} carte{plural})',
      allCaughtUp: "Vous êtes à jour ! Aucune carte à réviser pour le moment. Revenez plus tard.",
      verseAbbrev: 'v.',
      due: 'À réviser',
      resetAll: 'Réinitialiser toutes les cartes',
    },
    session: {
      verse: 'Verset',
      hintLabel: '(début du verset…)',
      showVerse: 'Afficher le verset',
      qualityLabel: "Comment avez-vous fait ?",
    },
    done: {
      title: 'Session terminée — bravo !',
      summary: 'Vous avez révisé {count} verset{plural}. Les cartes reviendront à leurs dates prévues.',
      backToOverview: "Retour à l'aperçu",
    },
    quality: { perfect: 'Parfait', good: 'Bien', ok: 'Correct', hard: 'Difficile', forgot: 'Oublié' },
  },
};
