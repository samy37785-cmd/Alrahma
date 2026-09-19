// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Per-language shell text for /tools/qibla, migrated LITERALLY from
// QiblaPage.jsx's inline isAr-forked strings -- no content added, changed,
// or reworded. Shared qibla-card text (title, fromNorth, distance,
// enableCompass, kaabaTitle/Text, etc.) already lived in the 6-language
// src/i18n/content.js TOOLS_TEXT.qibla export and is untouched.
//
// Only en/ar are populated -- it/es/de/fr stay genuinely absent; the route
// stays 'legacy' in translationStatus.js (see that file's own comment).
export const QIBLA_TEXT = {
  en: {
    dir: 'ltr',
    seo: {
      title: 'Qibla Direction',
      description: 'Find the exact Qibla direction from your location with a live compass on mobile.',
    },
    breadcrumbs: { tools: 'Tools', prayerTools: 'Prayer Tools', current: 'Qibla Direction' },
    hero: {
      title: 'Qibla Direction',
      sub: 'Find the direction of the Holy Kaaba from anywhere in the world, with a live compass on mobile.',
    },
    changeLocation: 'Change location',
  },
  ar: {
    dir: 'rtl',
    seo: {
      title: 'اتجاه القبلة',
      description: 'اعرف اتجاه القبلة الدقيق من موقعك مع بوصلة حية للهاتف المحمول.',
    },
    breadcrumbs: { tools: 'الأدوات', prayerTools: 'أدوات الصلاة', current: 'اتجاه القبلة' },
    hero: {
      title: 'اتجاه القبلة',
      sub: 'اعرف اتجاه الكعبة المشرفة من أي مكان في العالم، مع بوصلة حية على الهاتف المحمول.',
    },
    changeLocation: 'تغيير الموقع',
  },
};
