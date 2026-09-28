// French Localization Batch 1E: VerseCardModal.jsx (the shareable verse-card
// dialog opened from Verse of the Day and Quran Reader) had no lang branch
// at all -- every language, Arabic included, always saw this English text.
//
// `en` is the exact text the component rendered before this change (`quran`
// is the same "Quran ·" reference label used both inline and inside the
// share text/printable card). Only `fr` is added; every other language
// keeps seeing the same English text.
export const VERSE_CARD_MODAL_TEXT = {
  en: {
    dialogLabel: 'Share this verse',
    close: 'Close',
    share: '🔗 Share',
    copyLink: '📋 Copy link',
    saveAsImage: '🖨️ Save as image',
    hint: 'Take a screenshot of the card above to share it on Instagram or WhatsApp.',
    linkCopied: 'Verse link copied to clipboard!',
    quran: 'Quran',
  },
  fr: {
    dialogLabel: 'Partager ce verset',
    close: 'Fermer',
    share: '🔗 Partager',
    copyLink: '📋 Copier le lien',
    saveAsImage: "🖨️ Enregistrer comme image",
    hint: 'Faites une capture de la carte ci-dessus pour la partager sur Instagram ou WhatsApp.',
    linkCopied: 'Lien du verset copié !',
    quran: 'Coran',
  },
};

export function pickVerseCardModal(lang) {
  return lang === 'fr' ? VERSE_CARD_MODAL_TEXT.fr : VERSE_CARD_MODAL_TEXT.en;
}
