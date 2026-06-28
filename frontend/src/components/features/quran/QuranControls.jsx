export function CtrlItem({ icon, label, children }) {
  return (
    <div className="qlc__cbar-item">
      <span className="qlc__cbar-label">{icon}&nbsp;{label}</span>
      {children}
    </div>
  );
}

const SHORTCUTS = [
  { key: 'Space', ar: 'تشغيل / إيقاف' },
  { key: '← →',  ar: 'سورة سابقة / تالية' },
  { key: '+ / −', ar: 'حجم الخط' },
  { key: 'T',    ar: 'إظهار / إخفاء الترجمة' },
  { key: 'D',    ar: 'الوضع الليلي' },
  { key: 'G',    ar: 'الإعدادات' },
  { key: '?',    ar: 'كل الاختصارات' },
  { key: 'P',    ar: 'طباعة' },
  { key: 'Esc',  ar: 'إغلاق / إيقاف' },
];

export function KbdSidePanel({ open, onToggle }) {
  return (
    <div className={`qlc__ksp${open ? ' open' : ''}`}>
      <button className="qlc__ksp-tab" onClick={onToggle} title="Keyboard Shortcuts (K)">
        <span className="qlc__ksp-tab-icon">⌨</span>
        <span className="qlc__ksp-tab-text">مفاتيح</span>
      </button>
      <div className="qlc__ksp-body" dir="rtl">
        <p className="qlc__ksp-title">⌨ اختصارات لوحة المفاتيح</p>
        {SHORTCUTS.map(({ key, ar }) => (
          <div key={key} className="qlc__ksp-row">
            <span className="qlc__ksp-label">{ar}</span>
            <kbd className="qlc__kbd">{key}</kbd>
          </div>
        ))}
        <button className="qlc__ksp-close" onClick={onToggle}>إغلاق ✕</button>
      </div>
    </div>
  );
}

const SHORTCUT_GROUPS = [
  { title: 'Playback',   items: [['Space','Play / Pause'],['Esc','Stop']] },
  { title: 'Navigation', items: [['← →','Prev / Next Surah'],['1–9','Jump to Surah']] },
  { title: 'Display',    items: [['+ / −','Font size'],['T','Toggle translation'],['D','Dark mode']] },
  { title: 'Panels',     items: [['?','Shortcuts'],['G','Settings'],['K','Side shortcuts'],['P','Print']] },
];

export function ShortcutsModal({ onClose }) {
  return (
    <div className="qlc__overlay" onClick={onClose}>
      <div className="qlc__shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="qlc__panel-head">
          <span>⌨ Keyboard Shortcuts</span>
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

export function SettingsPanel({ fontSize, setFontSize, darkMode, setDarkMode, showTrans, setShowTrans, onClose }) {
  return (
    <div className="qlc__overlay" onClick={onClose}>
      <div className="qlc__settings" onClick={(e) => e.stopPropagation()}>
        <div className="qlc__panel-head">
          <span>⚙ Settings</span>
          <button className="qlc__panel-close" onClick={onClose}>✕</button>
        </div>
        <div className="qlc__settings-body">
          <div className="qlc__settings-section">
            <p className="qlc__settings-label">Arabic Font Size</p>
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
          <div className="qlc__settings-section">
            <p className="qlc__settings-label">Appearance</p>
            <label className="qlc__toggle-row">
              <span>🌙 Dark mode</span>
              <div className={`qlc__switch${darkMode ? ' on' : ''}`} onClick={() => setDarkMode((v) => !v)}>
                <div className="qlc__switch-knob" />
              </div>
            </label>
            <label className="qlc__toggle-row">
              <span>🌐 Show translation</span>
              <div className={`qlc__switch${showTrans ? ' on' : ''}`} onClick={() => setShowTrans((v) => !v)}>
                <div className="qlc__switch-knob" />
              </div>
            </label>
          </div>
          <div className="qlc__settings-section">
            <p className="qlc__settings-hint">
              Press <kbd className="qlc__kbd qlc__kbd--sm">?</kbd> to see all shortcuts ·&nbsp;
              <kbd className="qlc__kbd qlc__kbd--sm">K</kbd> side panel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
