import { useLang } from '../../context/LangContext';
import { LANGS, LANG_LABELS } from '../../i18n';

export default function LangSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <div className="lang-switcher" aria-label="Choose language">
      {LANGS.map((code) => (
        <button
          key={code}
          className={`lang-btn${lang === code ? ' lang-btn--active' : ''}`}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
        >
          {LANG_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
