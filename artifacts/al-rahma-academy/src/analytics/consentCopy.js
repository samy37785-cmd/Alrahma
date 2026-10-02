// Owner-approved banner wording (EN/AR). French (Batch 1C) is translated
// from the English only, owner review recommended (see
// docs/french-localization-registry.md). Other locales fall back to English
// until their own translation is approved. Italian mirrors the English; the
// button names are quoted verbatim in ANALYTICS_PRIVACY_COPY.it (Privacy.jsx).
export const CONSENT_COPY = {
  en: {
    region: 'Cookie consent',
    message: 'We use optional analytics cookies to understand how visitors use our website and improve it. Analytics will not load unless you choose Accept.',
    accept: 'Accept analytics',
    reject: 'Reject',
    privacy: 'Privacy Policy',
    settings: 'Cookie settings',
  },
  ar: {
    region: 'الموافقة على ملفات تعريف الارتباط',
    message: 'نستخدم ملفات تعريف ارتباط اختيارية للتحليلات لفهم استخدام الزوار للموقع وتحسينه. لن يتم تحميل أدوات التحليلات إلا إذا اخترت الموافقة.',
    accept: 'السماح بالتحليلات',
    reject: 'رفض',
    privacy: 'سياسة الخصوصية',
    settings: 'إعدادات ملفات تعريف الارتباط',
  },
  fr: {
    region: 'Consentement aux cookies',
    message: 'Nous utilisons des cookies d’analyse facultatifs pour comprendre comment les visiteurs utilisent notre site web et l’améliorer. Les outils d’analyse ne sont pas chargés, sauf si vous choisissez d’accepter.',
    accept: 'Accepter les cookies d’analyse',
    reject: 'Refuser',
    privacy: 'Politique de confidentialité',
    settings: 'Paramètres des cookies',
  },
  it: {
    region: 'Consenso ai cookie',
    message: 'Utilizziamo cookie analitici facoltativi per capire come i visitatori usano il nostro sito web e migliorarlo. Gli strumenti di analisi non vengono caricati a meno che tu non scelga di accettare.',
    accept: 'Accetta i cookie analitici',
    reject: 'Rifiuta',
    privacy: 'Informativa sulla privacy',
    settings: 'Impostazioni dei cookie',
  },
};

export function pickConsentCopy(lang) {
  return CONSENT_COPY[lang] || CONSENT_COPY.en;
}
