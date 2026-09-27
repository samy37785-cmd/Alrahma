// Owner-approved banner wording (EN/AR). Other locales fall back to English
// until their own translation is approved.
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
};

export function pickConsentCopy(lang) {
  return CONSENT_COPY[lang] || CONSENT_COPY.en;
}
