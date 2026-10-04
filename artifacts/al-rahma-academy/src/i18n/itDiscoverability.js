// Italian-only entry points for the published Tajweed Checker
// (/it/tools/tajweed-checker), which no navigation surface linked to.
// Wording comes from the page's own Italian copy (i18n/tools/tajweedChecker.js).

export const IT_TAJWEED_ROUTE = '/tools/tajweed-checker';

export const IT_TAJWEED_HUB_CARD = Object.freeze({
  icon: '🎯',
  title: 'Verificatore di Tajweed con IA',
  desc: 'Esercitati col Tajweed: recita un versetto ad alta voce, vedi cosa ha riconosciuto il browser e ricevi un feedback.',
});

// Command palette (Ctrl+K): label + extra search terms (lower-case, matched as substrings).
export const IT_TAJWEED_PALETTE = Object.freeze({
  label: 'Verificatore di Tajweed',
  aliases: ['tajweed', 'tajwid', 'تجويد', 'verifica tajweed'],
});

// Extra search terms for existing palette entries, keyed by their `label` key.
export const IT_PALETTE_ALIASES = Object.freeze({
  faq: ['faq', 'domande', 'domande frequenti'],
});

// Related-tools link label (Verse of the Day page).
export const IT_TAJWEED_RELATED_LABEL = 'Verificatore di Tajweed';
