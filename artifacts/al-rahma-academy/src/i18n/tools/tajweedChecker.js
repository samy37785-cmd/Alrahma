// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Per-language shell text for /tools/tajweed-checker, migrated LITERALLY
// from TajweedCheckerPage.jsx's inline isAr-forked strings -- no content
// added, changed, or reworded. The practice VERSES (Arabic text,
// transliteration, English translation, reference) are untouched --
// they're the same fixed reference content for every UI language, not part
// of the isAr shell fork, and no Quran text/translation was invented or
// altered. `rec.lang = 'ar-SA'` (the speech-recognition language) is tool
// functionality, not translatable content, and is also untouched.
//
// `errors.recognitionError` uses a literal `{error}` token, replaced with
// the real SpeechRecognition error code via a plain string .replace() in
// the page component -- this preserves the exact original per-language
// behaviour (English appended the raw error code, Arabic did not) without
// any isAr/lang-based branching in the component.
//
// French Localization Batch 1E adds `fr`, translated from the English shell
// only, with the house glossary term "tajwid". it/es/de stay genuinely
// absent; the route stays 'legacy' in translationStatus.js for those (see
// that file's own comment).
export const TAJWEED_CHECKER_TEXT = {
  en: {
    seo: {
      title: 'AI Tajweed Checker',
      description: 'Practice Quran recitation and get instant AI feedback on your Tajweed',
    },
    breadcrumbs: { tools: 'Tools', current: 'Tajweed Checker' },
    eyebrow: 'AI-Powered',
    hero: {
      title: 'Tajweed Checker',
      sub: 'Read the verse aloud and get instant feedback on your recitation',
    },
    startReciting: 'Start Reciting',
    stop: 'Stop',
    listeningHint: 'Listening… recite the verse clearly',
    whatIHeard: 'What I heard:',
    tryAgain: 'Try again',
    errors: {
      noSpeechInline: 'Your browser does not support speech recognition. Try Chrome.',
      recognitionError: 'Speech recognition error: {error}',
      noSpeechBanner: 'Speech recognition is not supported in this browser. Please use Chrome for the best experience.',
    },
    feedback: {
      excellent: 'Excellent! Your recitation matches well.',
      good: 'Good effort! Try again for better accuracy.',
      keepPractising: 'Keep practising — listen carefully and try again.',
    },
  },
  ar: {
    seo: {
      title: 'مدقق التجويد بالذكاء الاصطناعي',
      description: 'تدرّب على تلاوة القرآن الكريم واحصل على تقييم فوري بالذكاء الاصطناعي',
    },
    breadcrumbs: { tools: 'الأدوات', current: 'مدقق التجويد' },
    eyebrow: 'الذكاء الاصطناعي',
    hero: {
      title: 'مدقق التجويد',
      sub: 'اقرأ الآية بصوت عالٍ واحصل على تقييم فوري لتلاوتك',
    },
    startReciting: 'ابدأ التلاوة',
    stop: 'إيقاف',
    listeningHint: 'يستمع… اقرأ الآية بصوت واضح',
    whatIHeard: 'ما سمعته:',
    tryAgain: 'حاول مرة أخرى',
    errors: {
      noSpeechInline: 'المتصفح لا يدعم التعرف على الصوت',
      recognitionError: 'حدث خطأ في التعرف على الصوت',
      noSpeechBanner: 'التعرف على الصوت غير مدعوم في هذا المتصفح. يُنصح باستخدام Chrome.',
    },
    feedback: {
      excellent: 'ممتاز! تلاوتك صحيحة.',
      good: 'جيد! حاول مرة أخرى لمزيد من الدقة.',
      keepPractising: 'واصل التدريب — استمع للمثال وكرر.',
    },
  },
  fr: {
    seo: {
      title: 'Vérificateur de tajwid par IA',
      description: 'Entraînez-vous à réciter le Coran et recevez un retour instantané par IA sur votre tajwid',
    },
    breadcrumbs: { tools: 'Outils', current: 'Vérificateur de tajwid' },
    eyebrow: "Propulsé par l'IA",
    hero: {
      title: 'Vérificateur de tajwid',
      sub: 'Lisez le verset à voix haute et recevez un retour instantané sur votre récitation',
    },
    startReciting: 'Commencer la récitation',
    stop: 'Arrêter',
    listeningHint: 'Écoute en cours… récitez le verset clairement',
    whatIHeard: "Ce que j'ai entendu :",
    tryAgain: 'Réessayer',
    errors: {
      noSpeechInline: "Votre navigateur ne prend pas en charge la reconnaissance vocale. Essayez Chrome.",
      recognitionError: 'Erreur de reconnaissance vocale : {error}',
      noSpeechBanner: "La reconnaissance vocale n'est pas prise en charge par ce navigateur. Utilisez Chrome pour une meilleure expérience.",
    },
    feedback: {
      excellent: 'Excellent ! Votre récitation correspond bien.',
      good: 'Bon effort ! Réessayez pour plus de précision.',
      keepPractising: "Continuez à vous entraîner — écoutez attentivement et réessayez.",
    },
  },
};
