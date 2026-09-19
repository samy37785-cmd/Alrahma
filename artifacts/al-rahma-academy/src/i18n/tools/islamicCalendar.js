// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Per-language shell text for /tools/islamic-calendar, migrated LITERALLY
// from IslamicCalendarPage.jsx's inline isAr-forked strings -- no content
// added, changed, or reworded. Shared calendar text (upcoming, ramadan,
// eidFitr, eidAdha, monthsTitle, month names, etc.) already lived in the
// 6-language src/i18n/content.js TOOLS_TEXT.cal export and is untouched;
// the page also now reuses TOOLS_TEXT.cal.months (already correct per
// language) instead of forking hijri.month.ar directly, since the two were
// already the same Arabic month names.
//
// Only en/ar are populated -- it/es/de/fr stay genuinely absent; the route
// stays 'legacy' in translationStatus.js (see that file's own comment).
export const ISLAMIC_CALENDAR_TEXT = {
  en: {
    dir: 'ltr',
    seo: {
      title: 'Islamic Calendar',
      description: "Today's Hijri date with countdowns to Ramadan, Eid al-Fitr, and Eid al-Adha.",
    },
    breadcrumbs: { tools: 'Tools', prayerTools: 'Prayer Tools', current: 'Islamic Calendar' },
    hero: {
      title: 'Islamic Calendar',
      sub: "Today's Hijri date with countdowns to Ramadan, Eid al-Fitr, and Eid al-Adha, plus Hijri month names.",
    },
    hijriEra: 'AH',
    changeCity: 'Change city',
  },
  ar: {
    dir: 'rtl',
    seo: {
      title: 'التقويم الإسلامي',
      description: 'التاريخ الهجري لليوم، والعد التنازلي لرمضان وعيد الفطر وعيد الأضحى.',
    },
    breadcrumbs: { tools: 'الأدوات', prayerTools: 'أدوات الصلاة', current: 'التقويم الإسلامي' },
    hero: {
      title: 'التقويم الإسلامي',
      sub: 'التاريخ الهجري لليوم مع العد التنازلي للمناسبات الإسلامية القادمة، ومرجع أشهر السنة الهجرية.',
    },
    hijriEra: 'هـ',
    changeCity: 'تغيير المدينة',
  },
};
