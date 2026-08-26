import { createContext, useState, useContext, useMemo, useEffect, useCallback } from 'react';
import translations, { LANGS } from '../i18n';
import { langFromPath, pathFor, stripLangPrefix } from '../utils/localePath';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      // The URL's own language prefix is authoritative when present — it's
      // what was actually rendered (prerendered file or basename-matched
      // route), so it must win over a stale localStorage preference.
      const { lang: pathLang } = langFromPath(window.location.pathname);
      if (pathLang) return pathLang;
      const urlParam = new URLSearchParams(window.location.search).get('lang');
      if (urlParam && LANGS.includes(urlParam)) return urlParam;
      const saved = localStorage.getItem('lang');
      return LANGS.includes(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((code) => {
    if (!LANGS.includes(code)) return;
    localStorage.setItem('lang', code);
    setLangState(code);
  }, []);

  // Apply dir and lang attributes on the root <html> element
  useEffect(() => {
    const dir = translations[lang]?.dir || 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  // A returning visitor's saved language preference can resolve `lang` to
  // something non-English even while the URL itself is unprefixed (English
  // basename) — e.g. a bookmarked "/" visited after previously picking
  // French. That's a real URL/content mismatch (wrong canonical, wrong
  // basename), so redirect once to the language's real URL. Full page load,
  // not client-side: basename is fixed at mount from the URL main.jsx first
  // saw, so only a fresh load picks up the new one.
  useEffect(() => {
    try {
      const { lang: pathLang } = langFromPath(window.location.pathname);
      if (!pathLang && lang !== 'en') {
        const target = pathFor(stripLangPrefix(window.location.pathname), lang);
        window.location.replace(target + window.location.search + window.location.hash);
      }
    } catch {
      // Worst case: visitor sees English content at an unprefixed URL, same
      // as before this fix existed — never block rendering on this.
    }
    // Intentionally run once on mount only — this reconciles the initial
    // load's URL/lang mismatch, not every subsequent lang change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, t: translations[lang] }),
    [lang, setLang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>');
  return ctx;
}
