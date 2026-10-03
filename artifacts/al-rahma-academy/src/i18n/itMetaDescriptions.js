// Italian SEO Meta Descriptions, Wave 1 (short pages): /it/resources/faq and
// /it/tools/adhkar previously used their on-page subtitle (t.faqPg.sub /
// t.adhkar.sub) as the <meta name="description">, which is too short for a search
// snippet. These strings are used ONLY for the <head> description; the visible
// subtitle text is unchanged. Italian only: every other language keeps whatever the
// caller passes as the fallback (same pattern as frMetaDescriptions.js).
// Each statement is visible on the page itself (FAQ questions, Adhkar categories,
// Arabic text with diacritics, sources and the repetition counter); no translation of
// any dua or hadith is created here.
export const IT_META_DESCRIPTIONS = {
  faq: 'Risposte alle domande più frequenti su lezioni online di Corano, insegnanti, prenotazione della prova gratuita, piani, rimborsi e requisiti tecnici.',
  adhkar: "Adhkar e du'a da Hisnul Muslim per mattino, sera, prima di dormire e dopo la preghiera: testo arabo con diacritici, fonti e contatore delle ripetizioni.",
};

export function pickItMetaDescription(key, lang, fallback) {
  return lang === 'it' ? IT_META_DESCRIPTIONS[key] : fallback;
}
