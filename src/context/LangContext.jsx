import { createContext, useState, useContext, useMemo, useEffect } from 'react';
import translations, { LANGS } from '../i18n';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const urlParam = new URLSearchParams(window.location.search).get('lang');
      if (urlParam && LANGS.includes(urlParam)) return urlParam;
      const saved = localStorage.getItem('lang');
      return LANGS.includes(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = (code) => {
    if (!LANGS.includes(code)) return;
    localStorage.setItem('lang', code);
    setLangState(code);
  };

  // Apply dir and lang attributes on the root <html> element
  useEffect(() => {
    const dir = translations[lang]?.dir || 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t: translations[lang] }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>');
  return ctx;
}
