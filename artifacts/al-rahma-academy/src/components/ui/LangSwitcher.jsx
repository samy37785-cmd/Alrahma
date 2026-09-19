import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '../../context/LangContext';
import { LANGS, LANG_LABELS } from '../../i18n';
import { getExperienceText } from '../../i18n/experience';
import { isPublished } from '../../data/translationStatus';

// Local to this component on purpose: the language picker always shows
// each language's own NATIVE self-name, regardless of the current UI
// language -- a visitor scanning for their language reads its native
// spelling, not a translation of it. A page that needs to display "this
// content speaks language X" TRANSLATED INTO the visitor's own language
// (e.g. TeacherProfile.jsx) uses src/i18n/languageNames.js instead, which
// is a different, unrelated concept -- not this list.
const LANG_FULL = {
  en: 'English',
  ar: 'العربية',
  it: 'Italiano',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
};

const FLAG = {
  en: '🇬🇧', ar: '🇪🇬', it: '🇮🇹', es: '🇪🇸', de: '🇩🇪', fr: '🇫🇷',
};

export default function LangSwitcher() {
  const { lang, setLang } = useLang();
  const copy = getExperienceText(lang).language;
  const inProgressBadge = getExperienceText(lang).translationInProgress.badge;
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  /* Close when clicking outside */
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (code) => { setLang(code); setOpen(false); };

  return (
    <div className="ls" ref={ref} aria-label={copy.choose}>
      <button
        type="button"
        className={`ls__trigger${open ? ' ls__trigger--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="ls__flag">{FLAG[lang]}</span>
        <span className="ls__code">{lang.toUpperCase()}</span>
        <svg className="ls__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <ul className="ls__menu" role="listbox" aria-label={copy.select}>
          {LANGS.map((code) => {
            const published = isPublished(pathname, code);
            return (
              <li key={code} role="option" aria-selected={lang === code}>
                <button
                  type="button"
                  className={`ls__option${lang === code ? ' ls__option--active' : ''}`}
                  onClick={() => select(code)}
                >
                  <span className="ls__flag">{FLAG[code]}</span>
                  <span className="ls__full">{LANG_FULL[code]}</span>
                  {!published && <span className="ls__badge">{inProgressBadge}</span>}
                  {lang === code && <span className="ls__tick">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
