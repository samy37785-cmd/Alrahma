// French P2 metadata fix: meta descriptions for pages whose <meta
// name="description"> was previously the on-page subtitle string (t.faqPg.sub
// / t.adhkar.sub) -- too short for a search snippet. These are used ONLY for
// the <head> description; the visible subtitle text is unchanged.
//
// Only French is defined: every other language keeps using the page's own
// string, so en/ar/it/es/de metadata is untouched. Copy states only what
// the pages themselves already say (no new claim, no translation of any
// dua/hadith/meaning).
export const FR_META_DESCRIPTIONS = {
  faq: "Réponses à vos questions sur Al-Rahma Academy : nos cours de Coran en ligne, nos enseignants certifiés Al-Azhar et la leçon d'essai gratuite.",
  adhkar: 'Adhkar du matin, du soir, du coucher et après la prière : texte arabe vocalisé, mérites et sources tirés de Hisnul Muslim, avec compteur de répétitions.',
};

export function pickFrMetaDescription(key, lang, fallback) {
  return lang === 'fr' ? FR_META_DESCRIPTIONS[key] : fallback;
}
