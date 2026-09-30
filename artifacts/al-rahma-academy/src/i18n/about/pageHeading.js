// About page H1 structure fix: /academy/about and /ar/academy/about
// rendered zero <h1> elements — the page's visible content started
// directly at an <h2> ("Our Mission & Vision" / its Arabic counterpart),
// a heading-structure gap (accessibility/SEO), not a translation gap.
// This file supplies the one missing, genuinely page-level H1 text,
// owner-approved verbatim; it/es/de fall back to English, no
// invented translation.
export const PAGE_HEADING_TEXT = {
  en: { h1: 'About Al-Rahma Academy' },
  ar: { h1: 'من نحن' },
  // French Localization Batch 1A: faithful translation of the English H1.
  fr: { h1: "À propos d'Al-Rahma Academy" },
  // Italian SEO wave: faithful translation of the English H1.
  it: { h1: 'Chi siamo su Al-Rahma Academy' },
};

export function pickPageHeading(lang) {
  return PAGE_HEADING_TEXT[lang] || PAGE_HEADING_TEXT.en;
}
