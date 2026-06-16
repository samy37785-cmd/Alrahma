import { useState, useRef, useEffect } from 'react';
import { useLang } from '../../context/LangContext';
import { LANGS, LANG_LABELS } from '../../i18n';

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
    <div className="ls" ref={ref} aria-label="Choose language">
      <button
        type="button"
        className={`ls__trigger${open ? ' ls__trigger--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="ls__flag">{FLAG[lang]}</span>
        <span className="ls__code">{lang.toUpperCase()}</span>
        <svg className="ls__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <ul className="ls__menu" role="listbox" aria-label="Select language">
          {LANGS.map((code) => (
            <li key={code} role="option" aria-selected={lang === code}>
              <button
                type="button"
                className={`ls__option${lang === code ? ' ls__option--active' : ''}`}
                onClick={() => select(code)}
              >
                <span className="ls__flag">{FLAG[code]}</span>
                <span className="ls__full">{LANG_FULL[code]}</span>
                {lang === code && <span className="ls__tick">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
