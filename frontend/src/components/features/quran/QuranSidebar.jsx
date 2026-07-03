import { JUZ_NAMES } from '../../../data/quranLangs';

export default function QuranSidebar({
  navMode, chapters, activeId, search, pageNum, juzNum, hizbNum, khatmDone, filtered, ui,
  onNavModeChange, onSurahSelect, onPageNav, onJuzNav, onHizbNav,
  onSearchChange, onKhatmToggle, onKhatmFromSelect, onNewKhatm,
  open, onClose,
}) {
  return (
    <>
      <div
        className={`qlc__sidebar-backdrop${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`qlc__sidebar${open ? ' qlc__sidebar--open' : ''}`}>
      <button className="qlc__sidebar-close" onClick={onClose} aria-label={ui.close || 'Close'}>✕</button>
      <div className="qlc__nav-tabs">
        {[
          { key: 'surah', label: ui.navSurah || 'Surah' },
          { key: 'page',  label: ui.navPage  || 'Page' },
          { key: 'juz',   label: ui.navJuz   || 'Juz' },
          { key: 'hizb',  label: ui.navHizb  || 'Hizb' },
          { key: 'khatm', label: 'ختمة' },
        ].map((m) => (
          <button
            key={m.key}
            className={`qlc__nav-tab${navMode === m.key ? ' active' : ''}`}
            onClick={() => onNavModeChange(m.key)}
          >{m.label}</button>
        ))}
      </div>

      {navMode === 'surah' && (
        <>
          <div className="qlc__sidebar-search">
            <input
              className="qlc__search"
              placeholder={ui.search}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              dir="auto"
            />
          </div>
          <ul className="qlc__list">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  className={`qlc__surah-btn${c.id === activeId ? ' active' : ''}`}
                  onClick={() => onSurahSelect(c.id)}
                >
                  <span className="qlc__snum">{c.id}</span>
                  <span className="qlc__snames">
                    <b>{c.name_simple}</b>
                    <small>{c.translated_name?.name} · {c.verses_count} {ui.verses}</small>
                  </span>
                  <span className="qlc__sar">{c.name_arabic}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {navMode === 'page' && (
        <div className="qlc__page-nav">
          <p className="qlc__page-label">{ui.page || 'Page'} (1–604)</p>
          <div className="qlc__page-row">
            <button className="qlc__page-arrow" onClick={() => onPageNav(pageNum - 1)} disabled={pageNum <= 1}>‹</button>
            <input type="number" className="qlc__page-input" value={pageNum} min={1} max={604}
              onChange={(e) => onPageNav(Number(e.target.value))} />
            <button className="qlc__page-arrow" onClick={() => onPageNav(pageNum + 1)} disabled={pageNum >= 604}>›</button>
          </div>
          <div className="qlc__page-grid">
            {Array.from({ length: 30 }, (_, i) => i * 20 + 1).map((p) => (
              <button key={p}
                className={`qlc__page-chip${pageNum >= p && pageNum < p + 20 ? ' active' : ''}`}
                onClick={() => onPageNav(p)}>{p}</button>
            ))}
          </div>
        </div>
      )}

      {navMode === 'juz' && (
        <ul className="qlc__list">
          {JUZ_NAMES.map((name, i) => (
            <li key={i + 1}>
              <button
                className={`qlc__surah-btn${juzNum === i + 1 ? ' active' : ''}`}
                onClick={() => onJuzNav(i + 1)}
              >
                <span className="qlc__snum">{i + 1}</span>
                <span className="qlc__snames">
                  <b>{ui.juz || 'Juz'} {i + 1}</b>
                  <small>{name}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {navMode === 'hizb' && (
        <ul className="qlc__list">
          {Array.from({ length: 60 }, (_, i) => i + 1).map((h) => (
            <li key={h}>
              <button
                className={`qlc__surah-btn${hizbNum === h ? ' active' : ''}`}
                onClick={() => onHizbNav(h)}
              >
                <span className="qlc__snum">{h}</span>
                <span className="qlc__snames">
                  <b>{ui.hizb || 'Hizb'} {h}</b>
                  <small>{ui.juz || 'Juz'} {Math.ceil(h / 2)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {navMode === 'khatm' && (
        <div className="qlc__khatm">
          <div className="qlc__khatm-header">
            <div className="qlc__khatm-bar">
              <div className="qlc__khatm-fill" style={{ width: `${(khatmDone.length / 114) * 100}%` }} />
            </div>
            <div className="qlc__khatm-meta">
              <span className="qlc__khatm-pct">{khatmDone.length}/114 سورة</span>
              <button className="qlc__khatm-new" onClick={onNewKhatm}>ختمة جديدة ↺</button>
            </div>
          </div>
          <ul className="qlc__khatm-list">
            {chapters.map((c) => (
              <li key={c.id} className={`qlc__khatm-item${khatmDone.includes(c.id) ? ' done' : ''}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={khatmDone.includes(c.id)}
                    onChange={() => onKhatmToggle(c.id)}
                  />
                  <button className="qlc__khatm-surah" onClick={() => onKhatmFromSelect(c.id)}>
                    <span className="qlc__khatm-snum">{c.id}</span>
                    <span className="qlc__khatm-sname">{c.name_simple}</span>
                    <span className="qlc__khatm-sar">{c.name_arabic}</span>
                  </button>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      </aside>
    </>
  );
}
