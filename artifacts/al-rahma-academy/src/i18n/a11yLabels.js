// French Localization Batch 1A: accessibility labels (aria-label / title)
// that were hardcoded English literals in the Home, Footer and shared
// components, so French pages announced English to screen readers.
//
// `en` is the exact text the components rendered before this change.
// Only `fr` is added. Every other language, Arabic included, keeps getting
// the English labels it already rendered: localizing the Arabic labels is
// an EN/AR change and stays outside the French program, which must not
// alter EN or AR output.
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
};

export function pickA11yLabels(lang) {
  return lang === 'fr' ? A11Y_LABELS_TEXT.fr : A11Y_LABELS_TEXT.en;
}
