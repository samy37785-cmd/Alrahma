// Maps public route paths to their lazy chunk's dynamic import().
// Consumed by RoutePrefetcher to start downloading a route's JS/CSS the
// moment its link becomes visible or is touched/pressed — well before the
// user's tap navigation completes — instead of waiting for React Router to
// resolve the match after the entry bundle has already finished executing.
// Mirrors the lazy() import calls in App.jsx; Vite/Rollup dedupes chunks by
// module id, so calling import() again here targets the same chunk.
export const routePreloadMap = {
  '/':                          () => import('./pages/Home'),
  '/login':                     () => import('./pages/Login'),
  '/register':                  () => import('./pages/Register'),
  '/tools/quran-reader':        () => import('./pages/Quran'),
  '/resources/blog':            () => import('./pages/Blog'),
  '/resources/faq':             () => import('./pages/FAQ'),
  '/academy/about':             () => import('./pages/About'),
  '/enroll':                    () => import('./pages/Enroll'),
  '/tools/prayer':              () => import('./pages/IslamicTools'),
  '/tools/adhkar':               () => import('./pages/Adhkar'),
  '/courses/ijazah':            () => import('./pages/CourseIjazah'),
  '/courses/islamic-studies':   () => import('./pages/CourseIslamicStudies'),
  '/tools/hadith':               () => import('./pages/HadithLibrary'),

  '/courses':                   () => import('./pages/hubs/CoursesHub'),
  '/courses/quran':             () => import('./pages/hubs/CoursesQuran'),
  '/courses/arabic':            () => import('./pages/hubs/CoursesArabic'),
  '/tools':                     () => import('./pages/hubs/ToolsHub'),
  '/resources':                 () => import('./pages/hubs/ResourcesHub'),
  '/academy':                   () => import('./pages/hubs/AcademyHub'),
  '/academy/teachers':          () => import('./pages/Teachers'),

  '/tools/tasbeeh':             () => import('./pages/tools/TasbeehPage'),
  '/tools/arabic-alphabet':     () => import('./pages/tools/ArabicAlphabetPage'),
  '/tools/prayer-times':        () => import('./pages/tools/PrayerTimesPage'),
  '/tools/qibla':                () => import('./pages/tools/QiblaPage'),
  '/tools/islamic-calendar':    () => import('./pages/tools/IslamicCalendarPage'),
  '/tools/verse-of-the-day':    () => import('./pages/tools/VerseOfTheDayPage'),
  '/tools/tajweed-checker':     () => import('./pages/tools/TajweedCheckerPage'),
  '/tools/hifz-review':         () => import('./pages/tools/HifzReviewPage'),
};
