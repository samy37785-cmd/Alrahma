// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Per-language shell text for /tools/tasbeeh, migrated LITERALLY from
// TasbeehPage.jsx's inline isAr-forked strings -- no content added,
// changed, or reworded. The counter widget itself
// (components/features/tools/Tasbeeh.jsx) has no isAr/language fork and is
// untouched -- out of this migration's scope.
//
// Only en/ar are populated -- it/es/de/fr stay genuinely absent; the route
// stays 'legacy' in translationStatus.js (see that file's own comment).
export const TASBEEH_TEXT = {
  en: {
    seo: {
      title: 'Tasbeeh Counter',
      description: 'Free digital tasbeeh counter. Count SubhanAllah, Alhamdulillah, AllahuAkbar and more with progress tracking.',
    },
    breadcrumbs: { tools: 'Tools', current: 'Tasbeeh Counter' },
    eyebrow: 'Dhikr',
    hero: {
      title: 'Digital Tasbeeh Counter',
      sub: 'Count your dhikr digitally — SubhanAllah, Alhamdulillah, AllahuAkbar and more.',
    },
  },
  ar: {
    seo: {
      title: 'مسبحة رقمية',
      description: 'مسبحة رقمية مجانية: سبحان الله، الحمد لله، الله أكبر، لا إله إلا الله. تتبع أذكارك اليومية.',
    },
    breadcrumbs: { tools: 'الأدوات', current: 'المسبحة' },
    eyebrow: 'الأذكار',
    hero: {
      title: 'المسبحة الرقمية',
      sub: 'عدّد أذكارك بسهولة — سبحان الله، الحمد لله، الله أكبر، وغيرها.',
    },
  },
};
