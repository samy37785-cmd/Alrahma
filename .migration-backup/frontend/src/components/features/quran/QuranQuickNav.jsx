import { useState, useMemo, useRef, useEffect } from 'react';

/*
 * QuranQuickNav — type-ahead-and-jump command palette (Ctrl+K / "/").
 * Distinct from QuranSidebar's browse-and-click model: parses raw input
 * to figure out the user's intent (surah:verse, page, juz, hizb, or a
 * free-text surah search) and jumps straight there.
 */
export default function QuranQuickNav({ chapters, onClose, onJumpVerse, onGoPage, onGoJuz, onGoHizb, onGoSurah, ui }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = useMemo(() => {
    const text = q.trim();
    if (!text) return [];
    const lower = text.toLowerCase();

    const verseMatch = text.match(/^(\d{1,3})\s*[:،]\s*(\d{1,3})$/);
    if (verseMatch) {
      const [, s, v] = verseMatch;
      return [{ kind: 'verse', label: `${ui.jumpToVerse || 'Jump to'} ${s}:${v}`, surah: Number(s), verse: Number(v) }];
    }

    const pageMatch = lower.match(/^p(?:age)?\s*(\d{1,3})$/);
    if (pageMatch) {
      const n = Number(pageMatch[1]);
      if (n >= 1 && n <= 604) return [{ kind: 'page', label: `${ui.page || 'Page'} ${n}`, n }];
    }
    // A bare number outside the 1-114 surah range is almost certainly a page number.
    if (/^\d{1,3}$/.test(text) && Number(text) > 114 && Number(text) <= 604) {
      const n = Number(text);
      return [{ kind: 'page', label: `${ui.page || 'Page'} ${n}`, n }];
    }

    const juzMatch = lower.match(/^j(?:uz)?\s*(\d{1,2})$/);
    if (juzMatch) {
      const n = Number(juzMatch[1]);
      if (n >= 1 && n <= 30) return [{ kind: 'juz', label: `${ui.juz || 'Juz'} ${n}`, n }];
    }

    const hizbMatch = lower.match(/^h(?:izb)?\s*(\d{1,2})$/);
    if (hizbMatch) {
      const n = Number(hizbMatch[1]);
      if (n >= 1 && n <= 60) return [{ kind: 'hizb', label: `${ui.hizb || 'Hizb'} ${n}`, n }];
    }

    if (/^\d{1,3}$/.test(text)) {
      const n = Number(text);
      if (n >= 1 && n <= 114) {
        const ch = chapters.find((c) => c.id === n);
        return [{ kind: 'surah', label: `${n}. ${ch?.name_simple || ''}`, n }];
      }
    }

    return chapters
      .filter((c) => c.name_simple.toLowerCase().includes(lower) || c.name_arabic.includes(text))
      .slice(0, 8)
      .map((c) => ({ kind: 'surah', label: `${c.id}. ${c.name_simple} — ${c.name_arabic}`, n: c.id }));
  }, [q, chapters, ui]);

  const select = (m) => {
    if (m.kind === 'verse') { onGoSurah(m.surah); onJumpVerse(m.surah, m.verse); }
    else if (m.kind === 'page') onGoPage(m.n);
    else if (m.kind === 'juz') onGoJuz(m.n);
    else if (m.kind === 'hizb') onGoHizb(m.n);
    else if (m.kind === 'surah') onGoSurah(m.n);
    onClose();
  };

  return (
    <div className="qlc__overlay" onClick={onClose}>
      <div className="qlc__quicknav" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="qlc__quicknav-input"
          placeholder={ui.quickNavPlaceholder || 'Go to… e.g. 18:10, p400, j15, h20, or a surah name'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) select(matches[0]);
            if (e.key === 'Escape') onClose();
          }}
        />
        <ul className="qlc__quicknav-results">
          {matches.map((m, i) => (
            <li key={i}>
              <button className="qlc__quicknav-result" onClick={() => select(m)}>{m.label}</button>
            </li>
          ))}
          {q.trim() && matches.length === 0 && (
            <li className="qlc__quicknav-empty">{ui.noResults || 'No matches'}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
