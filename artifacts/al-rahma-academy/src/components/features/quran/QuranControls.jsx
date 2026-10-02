import { useLang } from '../../../context/LangContext';
import { pickQuranA11y } from '../../../i18n/quran/a11yLabels';
import { pickControlsPanels } from '../../../i18n/quran/controlsPanels';
import { pickKbdSidePanel } from '../../../i18n/quran/kbdSidePanel';

export function CtrlItem({ icon, label, children }) {
  return (
    <div className="qlc__cbar-item">
      <span className="qlc__cbar-label">{icon}&nbsp;{label}</span>
      {children}
    </div>
  );
}

export function KbdSidePanel({ open, onToggle }) {
  const { lang } = useLang();
  const a11y = pickQuranA11y(lang);
  const sp = pickKbdSidePanel(lang);
  return (
    <div className={`qlc__ksp${open ? ' open' : ''}`}>
      <button className="qlc__ksp-tab" onClick={onToggle} title={a11y.quranKbdShortcutsTab}>
        <span className="qlc__ksp-tab-icon">⌨</span>
        <span className="qlc__ksp-tab-text">{sp.tab}</span>
      </button>
      <div className="qlc__ksp-body" dir={sp.dir}>
        <p className="qlc__ksp-title">{sp.title}</p>
        {Object.entries(sp.rows).map(([key, label]) => (
          <div key={key} className="qlc__ksp-row">
            <span className="qlc__ksp-label">{label}</span>
            <kbd className="qlc__kbd">{key}</kbd>
          </div>
        ))}
        <button className="qlc__ksp-close" onClick={onToggle}>{sp.close}</button>
      </div>
    </div>
  );
}

export function ShortcutsModal({ onClose }) {
  const { lang } = useLang();
  const cp = pickControlsPanels(lang);
  const SHORTCUT_GROUPS = [
    { title: cp.groups.playback,   items: [['Space', cp.items.playPause], ['Esc', cp.items.stop]] },
    { title: cp.groups.navigation, items: [['← →', cp.items.prevNextSurah], ['1–9', cp.items.jumpToSurah]] },
    { title: cp.groups.display,    items: [['+ / −', cp.items.fontSize], ['T', cp.items.toggleTranslation], ['D', cp.items.darkModeItem]] },
    { title: cp.groups.panels,     items: [['?', cp.items.shortcuts], ['G', cp.items.settings], ['K', cp.items.sideShortcuts], ['P', cp.items.print]] },
  ];
  return (
    <div className="qlc__overlay" onClick={onClose}>
      <div className="qlc__shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="qlc__panel-head">
          <span>{cp.shortcutsTitle}</span>
          <button className="qlc__panel-close" onClick={onClose}>✕</button>
        </div>
        <div className="qlc__shortcuts-body">
          {SHORTCUT_GROUPS.map((g) => (
            <div key={g.title} className="qlc__shortcuts-group">
              <p className="qlc__shortcuts-cat">{g.title}</p>
              {g.items.map(([k, l]) => (
                <div key={k} className="qlc__shortcut-row">
                  <kbd className="qlc__kbd">{k}</kbd>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({
  fontSize, setFontSize, darkMode, setDarkMode, showTrans, setShowTrans,
  readingTheme, setReadingTheme, lineHeight, setLineHeight, contentWidth, setContentWidth,
  onClose,
}) {
  const { lang } = useLang();
  const cp = pickControlsPanels(lang);
  const THEMES = [
    { key: 'light', icon: '☀️', label: cp.themes.light },
    { key: 'sepia', icon: '📜', label: cp.themes.sepia },
    { key: 'dark',  icon: '🌙', label: cp.themes.dark },
  ];
  return (
    <div className="qlc__overlay" onClick={onClose}>
      <div className="qlc__settings" onClick={(e) => e.stopPropagation()}>
        <div className="qlc__panel-head">
          <span>{cp.settingsTitle}</span>
          <button className="qlc__panel-close" onClick={onClose}>✕</button>
        </div>
        <div className="qlc__settings-body">
          <div className="qlc__settings-section">
            <p className="qlc__settings-label">{cp.arabicFontSize}</p>
            <div className="qlc__fontsize-row">
              <button className="qlc__fontsize-btn" onClick={() => setFontSize((v) => Math.max(v - 2, 22))}>A−</button>
              <input type="range" min={22} max={52} value={fontSize} className="qlc__fontsize-slider"
                onChange={(e) => setFontSize(Number(e.target.value))} />
              <button className="qlc__fontsize-btn" onClick={() => setFontSize((v) => Math.min(v + 2, 52))}>A+</button>
            </div>
            <p className="qlc__fontsize-preview" style={{ fontSize: `${fontSize}px` }}>
              بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
            </p>
          </div>

          {readingTheme !== undefined && setReadingTheme && (
            <div className="qlc__settings-section">
              <p className="qlc__settings-label">{cp.readingTheme}</p>
              <div className="qlc__theme-row">
                {THEMES.map((t) => (
                  <button
                    key={t.key}
                    className={`qlc__theme-btn qlc__theme-btn--${t.key}${readingTheme === t.key ? ' active' : ''}`}
                    onClick={() => setReadingTheme(t.key)}
                  >
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {setLineHeight && (
            <div className="qlc__settings-section">
              <p className="qlc__settings-label">{cp.lineSpacing}</p>
              <div className="qlc__fontsize-row">
                <button className="qlc__fontsize-btn" onClick={() => setLineHeight((v) => Math.max(1.6, +(v - 0.1).toFixed(1)))}>−</button>
                <input type="range" min={1.6} max={3.0} step={0.1} value={lineHeight} className="qlc__fontsize-slider"
                  onChange={(e) => setLineHeight(Number(e.target.value))} />
                <button className="qlc__fontsize-btn" onClick={() => setLineHeight((v) => Math.min(3.0, +(v + 0.1).toFixed(1)))}>+</button>
              </div>
            </div>
          )}

          {setContentWidth && (
            <div className="qlc__settings-section">
              <p className="qlc__settings-label">{cp.contentWidth}</p>
              <div className="qlc__theme-row">
                {[['narrow', cp.widths.narrow], ['medium', cp.widths.medium], ['wide', cp.widths.wide]].map(([key, label]) => (
                  <button
                    key={key}
                    className={`qlc__theme-btn${contentWidth === key ? ' active' : ''}`}
                    onClick={() => setContentWidth(key)}
                  >{label}</button>
                ))}
              </div>
            </div>
          )}

          <div className="qlc__settings-section">
            <p className="qlc__settings-label">{cp.appearance}</p>
            {!(readingTheme !== undefined && setReadingTheme) && (
              <label className="qlc__toggle-row">
                <span>{cp.darkMode}</span>
                <div className={`qlc__switch${darkMode ? ' on' : ''}`} onClick={() => setDarkMode((v) => !v)}>
                  <div className="qlc__switch-knob" />
                </div>
              </label>
            )}
            <label className="qlc__toggle-row">
              <span>{cp.showTranslation}</span>
              <div className={`qlc__switch${showTrans ? ' on' : ''}`} onClick={() => setShowTrans((v) => !v)}>
                <div className="qlc__switch-knob" />
              </div>
            </label>
          </div>
          <div className="qlc__settings-section">
            <p className="qlc__settings-hint">
              {cp.shortcutsHintPre} <kbd className="qlc__kbd qlc__kbd--sm">?</kbd> {cp.shortcutsHintMid}&nbsp;
              <kbd className="qlc__kbd qlc__kbd--sm">K</kbd> {cp.shortcutsHintSide}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
