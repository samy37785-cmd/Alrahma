import { createContext, useContext, useMemo, useEffect, useCallback } from 'react';
import translations, { LANGS } from '../i18n';
import { langFromPath, switchLanguageHref } from '../utils/localePath';

const LangContext = createContext(null);

// Stage 1 (see docs/localization-audit.md Priority 1 / plan history): the
// site moved from a `?lang=` query-string model to a path-prefix model
// (`/fr/...` + <BrowserRouter basename="/fr">). Every internal `<Link to>`
// that stays within the current page's language now just needs a plain,
// unprefixed `to` — basename prepends the prefix automatically, the same
// way <Route path="/courses/ijazah"> already resolves correctly under any
// basename with zero changes to the route table.
//
// `withLanguage` used to append `?lang=<code>` to a target so it survived
// client-side navigation; every real call site (Header's nav links,
// Tutors.jsx, Breadcrumbs.jsx) only ever passed the *current* language —
// "keep this link in the language I'm already in." Basename now does that
// for free, so this is kept only as a documented identity passthrough for
// API stability (it has ~20 call sites) rather than editing every one of
// them in this pass. New code should not call it — just pass `to` directly.
//
// EXCEPTION this does NOT cover: a target of the bare root path "/" (the
// home/brand link, a breadcrumb's Home crumb, a "go home" button). Under a
// non-English basename, react-router's <Link>/<Navigate> resolution cannot
// render "/" correctly (see utils/localePath.js's homeHref() comment for
// why) — those specific spots must use a raw `<a href={homeHref(hash)}>`
// instead of <Link>, not this function.
export function withLanguage(to) {
  return to;
}

export function LangProvider({ children }) {
  // The language is derived from the URL's path prefix — the single source
  // of truth under the path-prefix model, matching <BrowserRouter>'s own
  // basename computation in main.jsx. It cannot change within a session
  // without a full reload (switching language navigates to a new
  // basename — see setLang below), so this never needs to be reactive
  // state; a plain computed constant keeps every existing `lang` consumer
  // working unchanged.
  const lang = langFromPath(window.location.pathname).lang || 'en';

  // Switching language is a real navigation (a new basename can only be
  // picked up by main.jsx on a fresh load), not a state update. Kept as
  // `setLang(code)` for the ~existing call sites (LangSwitcher.jsx, and any
  // other language picker) so none of them need restructuring — only their
  // expectation of "instant in-place switch" changes to "brief reload",
  // which was already true of every real language switch under the old
  // ?lang= model too (LanguageUrlSync forced a full-tree re-render on every
  // route for the query param to stay in sync; a reload is simpler and
  // strictly more correct here since the language is now baked into the
  // router's basename).
  const setLang = useCallback((code) => {
    if (!LANGS.includes(code)) return;
    window.location.assign(
      switchLanguageHref(window.location.pathname, window.location.search, window.location.hash, code)
    );
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
