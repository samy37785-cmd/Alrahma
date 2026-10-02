// French P2 fix: the Quran Reader's keyboard-shortcuts SIDE panel
// (KbdSidePanel in components/features/quran/QuranControls.jsx) hardcoded
// Arabic UI text (tab label, title, row labels, close button) with no lang
// branch, so /fr/tools/quran-reader showed Arabic interface strings.
// (The ShortcutsModal beside it already reads from ./controlsPanels.js.)
//
// `ar` is the exact text the component rendered before this change, and
// every language except French keeps seeing it (en/ar/it unchanged). Only
// `fr` is new. Keys ('Space', '← →', ...) are the physical keys and are
// never translated.
export const KBD_SIDE_PANEL_TEXT = {
  ar: {
    dir: 'rtl',
    tab: 'مفاتيح',
    title: '⌨ اختصارات لوحة المفاتيح',
    close: 'إغلاق ✕',
    rows: {
      'Space': 'تشغيل / إيقاف',
      '← →': 'سورة سابقة / تالية',
      '+ / −': 'حجم الخط',
      'T': 'إظهار / إخفاء الترجمة',
      'D': 'الوضع الليلي',
      'G': 'الإعدادات',
      '?': 'كل الاختصارات',
      'P': 'طباعة',
      'Esc': 'إغلاق / إيقاف',
    },
  },
  fr: {
    dir: 'ltr',
    tab: 'Touches',
    title: '⌨ Raccourcis clavier',
    close: 'Fermer ✕',
    rows: {
      'Space': 'Lecture / Pause',
      '← →': 'Sourate précédente / suivante',
      '+ / −': 'Taille du texte',
      'T': 'Afficher/masquer la traduction',
      'D': 'Mode sombre',
      'G': 'Paramètres',
      '?': 'Tous les raccourcis',
      'P': 'Imprimer',
      'Esc': 'Fermer / Arrêter',
    },
  },
};

export function pickKbdSidePanel(lang) {
  return lang === 'fr' ? KBD_SIDE_PANEL_TEXT.fr : KBD_SIDE_PANEL_TEXT.ar;
}
