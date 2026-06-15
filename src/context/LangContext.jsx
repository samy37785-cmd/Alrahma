import { createContext, useState, useContext, useMemo } from 'react';
import translations, { LANGS } from '../i18n';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem('lang');
    return LANGS.includes(saved) ? saved : 'en';
  });

  const setLang = (code) => {
    if (!LANGS.includes(code)) return;
    localStorage.setItem('lang', code);
    setLangState(code);
  };

  const value = useMemo(
    () => ({ lang, setLang, t: translations[lang] }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>');
  return ctx;
}
