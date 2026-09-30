// French Localization Batch 1A: accessibility labels (aria-label / title)
// that were hardcoded English literals in the Home, Footer and shared
// components, so French pages announced English to screen readers.
//
// `en` is the exact text the components rendered before this change.
// Only `fr` is added. Every other language, Arabic included, keeps getting
// the English labels it already rendered: localizing the Arabic labels is
// an EN/AR change and stays outside the French program, which must not
// alter EN or AR output.
//
// Italian Batch 1B: `it` is added below for every ORDINARY label only.
// `isnadSection`/`isnadChain` are the aria-labels of the homepage's Isnad
// (hadith transmission chain) section -- religious content under the same
// source-language policy as Italian Batch 0 (it.js hero.verseQuote/
// verseRef, adhkarText.js meaning/fadl). Per that policy this file's `it`
// entries for those two keys are the literal English source, byte-identical
// to `en`, not a translation -- exactly the technique Batch 0 used, so a
// screen reader on the Italian page still gets a real label instead of
// `undefined` (pickA11yLabels returns a whole language object, not a
// per-key merge, so an omitted key would leave aria-label empty rather than
// falling back to English).
export const A11Y_LABELS_TEXT = {
  en: {
    heroLiveBadge: 'Live sessions available now',
    heroScrollCue: 'Scroll down to explore courses',
    lessonDemo: 'Live lesson demo',
    closeVideo: 'Close video',
    tutorVideo: (name) => `Introduction video for ${name}`,
    tutorVideoTitle: (name) => `${name} introduction`,
    reviewCount: (count) => `${count} reviews`,
    carouselPrev: 'Previous',
    carouselNext: 'Next',
    trustBar: 'Trusted worldwide',
    trustSignals: 'Trust signals',
    countriesRepresented: 'Countries represented',
    quizSection: 'Find your perfect course',
    quizProgress: (step, total) => `Step ${step} of ${total}`,
    isnadSection: 'The Isnad — unbroken chain of Quran transmission',
    isnadChain: 'Chain of Quran transmission',
    currencySelector: 'Currency selector',
    footerTrust: 'Trust credentials',
    audioRegion: 'Quran recitation audio',
    audioPlay: 'Play Quran recitation softly',
    audioMute: 'Mute Quran recitation',
    audioPlayTitle: 'Play Quran softly',
    audioMuteTitle: 'Mute recitation',
    audioDismiss: 'Dismiss audio player',
  },
  fr: {
    heroLiveBadge: 'Cours en direct disponibles maintenant',
    heroScrollCue: 'Faites défiler pour découvrir les cours',
    lessonDemo: 'Démonstration de cours en direct',
    closeVideo: 'Fermer la vidéo',
    tutorVideo: (name) => `Vidéo de présentation de ${name}`,
    tutorVideoTitle: (name) => `Présentation de ${name}`,
    reviewCount: (count) => `${count} avis`,
    carouselPrev: 'Précédent',
    carouselNext: 'Suivant',
    trustBar: 'Reconnue dans le monde entier',
    trustSignals: 'Gages de confiance',
    countriesRepresented: 'Pays représentés',
    quizSection: 'Trouvez le cours idéal',
    quizProgress: (step, total) => `Étape ${step} sur ${total}`,
    isnadSection: "L'isnad — chaîne ininterrompue de transmission du Coran",
    isnadChain: 'Chaîne de transmission du Coran',
    currencySelector: 'Choix de la devise',
    footerTrust: 'Garanties de confiance',
    audioRegion: 'Récitation audio du Coran',
    audioPlay: 'Écouter la récitation du Coran à faible volume',
    audioMute: 'Couper la récitation du Coran',
    audioPlayTitle: 'Écouter le Coran doucement',
    audioMuteTitle: 'Couper la récitation',
    audioDismiss: 'Fermer le lecteur audio',
  },
  it: {
    heroLiveBadge: 'Sessioni dal vivo disponibili ora',
    heroScrollCue: 'Scorri per esplorare i corsi',
    lessonDemo: 'Demo di lezione dal vivo',
    closeVideo: 'Chiudi video',
    tutorVideo: (name) => `Video di presentazione di ${name}`,
    tutorVideoTitle: (name) => `Presentazione di ${name}`,
    reviewCount: (count) => `${count} recensioni`,
    carouselPrev: 'Precedente',
    carouselNext: 'Successivo',
    trustBar: 'Affidabile in tutto il mondo',
    trustSignals: 'Garanzie di fiducia',
    countriesRepresented: 'Paesi rappresentati',
    quizSection: 'Trova il corso perfetto per te',
    quizProgress: (step, total) => `Passo ${step} di ${total}`,
    // Religious content -- literal English source, not a translation (see
    // file header). Byte-identical to `en` on purpose.
    isnadSection: 'The Isnad — unbroken chain of Quran transmission',
    isnadChain: 'Chain of Quran transmission',
    currencySelector: 'Selettore valuta',
    footerTrust: 'Credenziali di fiducia',
    audioRegion: 'Audio recitazione del Corano',
    audioPlay: 'Riproduci la recitazione del Corano a basso volume',
    audioMute: 'Disattiva la recitazione del Corano',
    audioPlayTitle: 'Riproduci il Corano dolcemente',
    audioMuteTitle: 'Disattiva la recitazione',
    audioDismiss: 'Chiudi il lettore audio',
  },
};

export function pickA11yLabels(lang) {
  if (lang === 'it') return A11Y_LABELS_TEXT.it;
  if (lang === 'fr') return A11Y_LABELS_TEXT.fr;
  return A11Y_LABELS_TEXT.en;
}
