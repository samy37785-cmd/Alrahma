// Each language's dictionary is its own chunk (2026-10-15): a visitor downloads
// only the language of the page they opened (~40-47 KiB) instead of all six
// (~263 KiB in the main bundle before). The language is fixed for a page load
// (switching language reloads, see context/LangContext.jsx), so main.jsx loads
// it once before the first render. Tests register all six up front in
// src/test/setup.js.
const LOADERS = {
  en: () => import('./en.js'),
  it: () => import('./it.js'),
  es: () => import('./es.js'),
  de: () => import('./de.js'),
  fr: () => import('./fr.js'),
  ar: () => import('./ar.js'),
};

const loaded = {};

export function registerTranslations(lang, dict) {
  loaded[lang] = dict;
}

// The dictionary for `lang` (English if that one was never loaded).
export function translationsFor(lang) {
  return loaded[lang] ?? loaded.en;
}

export async function loadTranslations(lang) {
  const code = LOADERS[lang] ? lang : 'en';
  if (!loaded[code]) loaded[code] = (await LOADERS[code]()).default;
  return loaded[code];
}

export const LANGS = ["en","ar","it","es","de","fr"];
export const LANG_LABELS = {"en":"EN 🇬🇧","ar":"عربي 🇪🇬","it":"IT 🇮🇹","es":"ES 🇪🇸","de":"DE 🇩🇪","fr":"FR 🇫🇷"};
