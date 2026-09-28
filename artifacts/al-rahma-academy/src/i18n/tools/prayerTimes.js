// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Per-language shell text for /tools/prayer-times, migrated LITERALLY from
// PrayerTimesPage.jsx's inline isAr-forked strings -- no content added,
// changed, or reworded. Shared control labels (calc method, Asr school,
// prayer/extra names, month names, etc.) already lived in the 6-language
// src/i18n/content.js TOOLS_TEXT export and are untouched, still imported
// separately by the page.
//
// French Localization Batch 1E adds `fr`, translated from the English shell
// only. it/es/de stay genuinely absent; the route stays 'legacy' in
// translationStatus.js for those (see that file's own comment).
export const PRAYER_TIMES_TEXT = {
  en: {
    dir: 'ltr',
    seo: {
      title: 'Prayer Times',
      description: 'Accurate prayer times for your location with live countdown, prayer alerts, and full monthly timetable.',
    },
    breadcrumbs: { tools: 'Tools', prayerTools: 'Prayer Tools', current: 'Prayer Times' },
    hero: {
      title: 'Prayer Times',
      sub: 'Accurate times for your location with a live countdown to the next prayer, alerts, and a monthly timetable.',
    },
    hijriEra: 'AH',
    notifyToggleAria: 'Toggle prayer alerts',
  },
  ar: {
    dir: 'rtl',
    seo: {
      title: 'مواقيت الصلاة',
      description: 'مواقيت صلاة دقيقة لموقعك مع عداد تنازلي للصلاة القادمة، ومنبه الصلاة، والجدول الشهري الكامل.',
    },
    breadcrumbs: { tools: 'الأدوات', prayerTools: 'أدوات الصلاة', current: 'مواقيت الصلاة' },
    hero: {
      title: 'مواقيت الصلاة',
      sub: 'مواقيت دقيقة لموقعك مع عداد تنازلي مباشر للصلاة القادمة، ومنبه الصلاة، والجدول الشهري.',
    },
    hijriEra: 'هـ',
    notifyToggleAria: 'تفعيل منبّه الصلاة',
  },
  fr: {
    dir: 'ltr',
    seo: {
      title: 'Horaires de prière',
      description: 'Horaires de prière précis pour votre position, avec compte à rebours en direct, alertes de prière et calendrier mensuel complet.',
    },
    breadcrumbs: { tools: 'Outils', prayerTools: 'Outils de prière', current: 'Horaires de prière' },
    hero: {
      title: 'Horaires de prière',
      sub: 'Horaires précis pour votre position, avec un compte à rebours en direct jusqu\'à la prochaine prière, des alertes et un calendrier mensuel.',
    },
    hijriEra: 'H',
    notifyToggleAria: 'Activer les alertes de prière',
  },
};
