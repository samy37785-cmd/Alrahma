import { createContext, useState, useContext, useMemo, useEffect, useCallback, useRef } from 'react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router-dom';
import translations, { LANGS } from '../i18n';

const LangContext = createContext(null);

// Use this for internal targets that include their own query string or hash.
// URLSearchParams retains target-specific values (for example, teacher/course)
// while ensuring an explicit language selection survives the transition.
export function withLanguage(to, lang) {
  const [pathAndSearch, hash = ''] = to.split('#', 2);
  const [pathname, searchString = ''] = pathAndSearch.split('?', 2);
  const search = new URLSearchParams(searchString);
  search.set('lang', lang);
  return `${pathname}?${search.toString()}${hash ? `#${hash}` : ''}`;
}

function LanguageUrlSync({ lang, selectionVersion, onUrlLanguage }) {
  const location = useLocation();
  const navigate = useNavigate();
  const handledSelectionVersion = useRef(selectionVersion);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const urlLang = search.get('lang');

    // A direct picker action wins over the query value from the previous render.
    if (handledSelectionVersion.current !== selectionVersion) {
      handledSelectionVersion.current = selectionVersion;
      if (urlLang !== lang) {
        search.set('lang', lang);
        navigate(
          { pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash },
          { replace: true },
        );
      }
      return;
    }

    if (urlLang && LANGS.includes(urlLang) && urlLang !== lang) {
      onUrlLanguage(urlLang);
      return;
    }
    if (urlLang !== lang) {
      search.set('lang', lang);
      navigate(
        { pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash },
        { replace: true },
      );
    }
  }, [lang, location.hash, location.pathname, location.search, navigate, onUrlLanguage, selectionVersion]);

  return null;
}

export function LangProvider({ children }) {
  const inRouter = useInRouterContext();
  const [selectionVersion, setSelectionVersion] = useState(0);
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

  const setLang = useCallback((code) => {
    if (!LANGS.includes(code)) return;
    try {
      localStorage.setItem('lang', code);
    } catch {
      // Language selection still works when storage is unavailable.
    }
    setLangState(code);
    setSelectionVersion((version) => version + 1);
  }, []);

  const setLangFromUrl = useCallback((code) => {
    setLangState(code);
    try {
      localStorage.setItem('lang', code);
    } catch {
      // Language selection still works when storage is unavailable.
    }
  }, []);

  // Apply dir and lang attributes on the root <html> element
  useEffect(() => {
    const dir = translations[lang]?.dir || 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t: translations[lang] }),
    [lang, setLang]
  );

  return (
    <LangContext.Provider value={value}>
      {inRouter && <LanguageUrlSync lang={lang} selectionVersion={selectionVersion} onUrlLanguage={setLangFromUrl} />}
      {children}
    </LangContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>');
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalLang() {
  return useContext(LangContext);
}
