// About page H1 structure fix: /academy/about and /ar/academy/about
// rendered zero <h1> elements — the page's visible content started
// directly at an <h2> ("Our Mission & Vision" / its Arabic counterpart),
// a heading-structure gap (accessibility/SEO), not a translation gap.
// This file supplies the one missing, genuinely page-level H1 text,
// owner-approved verbatim; it/es/de/fr fall back to English, no
// invented translation.
export const PAGE_HEADING_TEXT = {
  en: { h1: 'About Al-Rahma Academy' },
  ar: { h1: 'من نحن' },
};

export function pickPageHeading(lang) {
  return PAGE_HEADING_TEXT[lang] || PAGE_HEADING_TEXT.en;
}
