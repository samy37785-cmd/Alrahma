import { Link } from 'react-router-dom';
import { homeHref } from '../../../utils/localePath';
import Brand from '../../layout/Brand';
import { TRANSLATIONS } from '../../../data/quranLangs';
import { useLang } from '../../../context/LangContext';
import { pickQuranA11y } from '../../../i18n/quran/a11yLabels';

export default function QuranTopBar({
  tab, darkMode, kbdPanelOpen, lang, ui,
  onTabChange, onLangChange, onSettingsToggle, onKbdToggle, onDarkToggle, onQuickNavToggle,
  onSidebarToggle,
}) {
  // `lang` above is the reader's own translation-language picker, not the
  // site's interface language (see Quran.jsx's own `lang`/`siteLang` split);
  // the a11y labels below need the latter, read separately via context.
  const { lang: siteLang } = useLang();
  const a11y = pickQuranA11y(siteLang);
  return (
    <header className="qlc__bar">
      <div className="qlc__bar-inner">
        <button
          className="qlc__sidebar-toggle"
          onClick={onSidebarToggle}
          aria-label={ui.browseMenu || 'Browse'}
          title={ui.browseMenu || 'Browse'}
        >☰</button>
        <Brand />

        <nav className="qlc__tabs">
          {[
            { key: 'reading', icon: '📖', label: ui.reading },
            { key: 'hifz',    icon: '🧠', label: ui.hifz },
          ].map((t) => (
            <button
              key={t.key}
              className={`qlc__tab${tab === t.key ? ' qlc__tab--active' : ''}`}
              onClick={() => onTabChange(t.key)}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>

        <div className="qlc__bar-right">
          <div className="qlc__lang-wrap">
            <span>🌍</span>
            <select className="qlc__lang-select" value={lang} onChange={(e) => onLangChange(e.target.value)}>
              {TRANSLATIONS.map((t) => (
                <option key={t.lang} value={t.lang}>{t.flag} {t.label}</option>
              ))}
            </select>
          </div>

          <button className="qlc__bar-icon" onClick={onQuickNavToggle} title={a11y.quranQuickNavTab}>🔎</button>
          <button className="qlc__bar-icon" onClick={onSettingsToggle} title={a11y.quranSettingsTab}>⚙</button>
          <button
            className={`qlc__bar-icon${kbdPanelOpen ? ' active' : ''}`}
            onClick={onKbdToggle}
            title={a11y.quranKbdPanelTab}
          >⌨</button>
          <button
            className={`qlc__bar-icon${darkMode ? ' active' : ''}`}
            onClick={onDarkToggle}
            title={a11y.quranDarkModeTab}
          >🌙</button>
          <button className="qlc__bar-icon" onClick={() => window.print()} title={a11y.quranPrintTab}>🖨</button>

          <a href={homeHref()} className="btn btn--ghost btn--sm qlc__back">{ui.back}</a>
        </div>
      </div>
    </header>
  );
}
