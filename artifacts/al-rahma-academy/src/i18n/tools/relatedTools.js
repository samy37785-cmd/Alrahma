// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Shared "Related tools" nav block text, reused identically by
// PrayerTimesPage.jsx, QiblaPage.jsx and IslamicCalendarPage.jsx (the three
// tool pages that cross-link to each other + Verse of the Day). Icons and
// `to` targets stay inline in each page (structural, not text). French
// Localization Batch 1E adds `fr`, translated from the English shell only.
// it/es/de stay genuinely absent/legacy, same as every other Phase 4 module.
export const RELATED_TOOLS_TEXT = {
  en: {
    ariaLabel: 'Related tools',
    alsoTry: 'Also try:',
    prayerTimes: 'Prayer Times',
    qibla: 'Qibla Direction',
    calendar: 'Islamic Calendar',
    verse: 'Verse of the Day',
  },
  ar: {
    ariaLabel: 'أدوات مرتبطة',
    alsoTry: 'استكشف أيضاً:',
    prayerTimes: 'مواقيت الصلاة',
    qibla: 'اتجاه القبلة',
    calendar: 'التقويم الإسلامي',
    verse: 'آية اليوم',
  },
  fr: {
    ariaLabel: 'Outils associés',
    alsoTry: 'À découvrir aussi :',
    prayerTimes: 'Horaires de prière',
    qibla: 'Direction de la Qibla',
    calendar: 'Calendrier islamique',
    verse: 'Verset du jour',
  },
  it: {
    ariaLabel: 'Strumenti correlati',
    alsoTry: 'Prova anche:',
    prayerTimes: 'Orari di preghiera',
    qibla: 'Direzione della Qibla',
    calendar: 'Calendario islamico',
    verse: 'Versetto del giorno',
  },
};
