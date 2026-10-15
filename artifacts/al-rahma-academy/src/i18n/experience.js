// Interface copy that is not in the main dictionaries (header, dashboard shell,
// dialogs...). Like i18n/index.js, each language is its own chunk (2026-10-15):
// main.jsx loads the page's language together with its dictionary (see
// loadTranslations), so a visitor downloads one language, not six. Tests
// register all six in src/test/setup.js.
const LOADERS = {
  en: () => import('./experience/en.js'),
  it: () => import('./experience/it.js'),
  es: () => import('./experience/es.js'),
  de: () => import('./experience/de.js'),
  fr: () => import('./experience/fr.js'),
  ar: () => import('./experience/ar.js'),
};

const loaded = {};

export function registerExperienceText(lang, copy) {
  loaded[lang] = copy;
}

export async function loadExperienceText(lang) {
  const code = LOADERS[lang] ? lang : 'en';
  if (!loaded[code]) loaded[code] = (await LOADERS[code]()).default;
  return loaded[code];
}

export function getExperienceText(lang) {
  return loaded[lang] || loaded.en;
}
