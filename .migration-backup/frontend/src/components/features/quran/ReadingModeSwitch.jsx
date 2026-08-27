/*
 * ReadingModeSwitch — segmented control toggling between the two reading
 * styles (Continuous flowing Mushaf vs. per-verse study cards). Purely a
 * render-mode toggle: switching never refetches data or resets scroll,
 * since both renderers read from the same already-loaded verse array.
 */
export default function ReadingModeSwitch({ mode, onChange, ui }) {
  const options = [
    { key: 'continuous', icon: '📖', label: ui.continuousReading || 'Continuous Reading' },
    { key: 'verse',      icon: '📑', label: ui.verseByVerse      || 'Verse by Verse' },
  ];

  return (
    <div className="qlc__mode-switch" role="tablist" aria-label={ui.readingMode || 'Reading mode'}>
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={mode === o.key}
          className={`qlc__mode-switch-btn${mode === o.key ? ' active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          <span className="qlc__mode-switch-icon">{o.icon}</span>
          <span className="qlc__mode-switch-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
