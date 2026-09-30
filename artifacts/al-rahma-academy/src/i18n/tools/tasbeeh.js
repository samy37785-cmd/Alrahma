// Arabic Tools Content Migration (Phase 4, 2026-09-18).
//
// Per-language shell text for /tools/tasbeeh, migrated LITERALLY from
// TasbeehPage.jsx's inline isAr-forked strings -- no content added,
// changed, or reworded. The counter widget itself
// (components/features/tools/Tasbeeh.jsx) has no isAr/language fork and is
// untouched -- out of this migration's scope.
//
// French Localization Batch 1E adds `fr`, translated from the English shell
// only (the counter widget itself already has full French via `t.tasbeeh`
// in i18n/fr.js). it/es/de stay genuinely absent; the route stays 'legacy'
// in translationStatus.js for those (see that file's own comment).
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
  fr: {
    seo: {
      title: 'Compteur de tasbih',
      description: 'Compteur de tasbih numérique gratuit. Comptez SubhanAllah, Alhamdulillah, AllahuAkbar et plus, avec suivi de la progression.',
    },
    breadcrumbs: { tools: 'Outils', current: 'Compteur de tasbih' },
    eyebrow: 'Dhikr',
    hero: {
      title: 'Compteur de tasbih numérique',
      sub: 'Comptez votre dhikr numériquement — SubhanAllah, Alhamdulillah, AllahuAkbar et plus.',
    },
  },
  // Italian SEO wave: translated from the English shell only; the dhikr
  // phrases themselves stay in their transliterated form, unchanged.
  it: {
    seo: {
      title: 'Contatore tasbeeh',
      description: 'Contatore tasbeeh digitale gratuito. Conta SubhanAllah, Alhamdulillah, AllahuAkbar e altro, con il monitoraggio dei progressi.',
    },
    breadcrumbs: { tools: 'Strumenti', current: 'Contatore tasbeeh' },
    eyebrow: 'Dhikr',
    hero: {
      title: 'Contatore tasbeeh digitale',
      sub: 'Conta il tuo dhikr in digitale — SubhanAllah, Alhamdulillah, AllahuAkbar e altro.',
    },
  },
};
