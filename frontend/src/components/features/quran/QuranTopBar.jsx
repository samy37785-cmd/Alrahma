import { Link } from 'react-router-dom';
import Brand from '../../layout/Brand';
import { TRANSLATIONS } from '../../../data/quranLangs';

export default function QuranTopBar({
  tab, darkMode, kbdPanelOpen, lang, ui,
  onTabChange, onLangChange, onSettingsToggle, onKbdToggle, onDarkToggle, onQuickNavToggle,
}) {
  return (
    <header className="qlc__bar">
      <div className="qlc__bar-inner">
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

          <button className="qlc__bar-icon" onClick={onQuickNavToggle} title="Quick navigation (/)">🔎</button>
          <button className="qlc__bar-icon" onClick={onSettingsToggle} title="Settings (G)">⚙</button>
          <button
            className={`qlc__bar-icon${kbdPanelOpen ? ' active' : ''}`}
            onClick={onKbdToggle}
            title="Keyboard panel (K)"
          >⌨</button>
          <button
            className={`qlc__bar-icon${darkMode ? ' active' : ''}`}
            onClick={onDarkToggle}
            title="Dark mode (D)"
          >🌙</button>
          <button className="qlc__bar-icon" onClick={() => window.print()} title="Print (P)">🖨</button>

          <Link to="/" className="btn btn--ghost btn--sm qlc__back">{ui.back}</Link>
        </div>
      </div>
    </header>
  );
}
