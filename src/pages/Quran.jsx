import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { getChapters, getVerses, getChapterAudio, RECITERS } from '../api/quran';

// Strip footnote tags from translation HTML.
const clean = (html = '') => html.replace(/<[^>]+>/g, '');

export default function Quran() {
  const [chapters, setChapters] = useState([]);
  const [activeId, setActiveId] = useState(1);
  const [reciterId, setReciterId] = useState(RECITERS[0].id);
  const [verses, setVerses] = useState([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const audioRef = useRef(null);

  // Load the surah list once.
  useEffect(() => {
    getChapters()
      .then(setChapters)
      .catch(() => setError('Could not load surahs.'));
  }, []);

  // Load verses + audio whenever the active surah or reciter changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([getVerses(activeId), getChapterAudio(activeId, reciterId)])
      .then(([v, url]) => {
        if (!active) return;
        setVerses(v);
        setAudioUrl(url);
      })
      .catch(() => active && setError('Could not load this surah.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [activeId, reciterId]);

  const activeChapter = chapters.find((c) => c.id === activeId);
  const filtered = chapters.filter(
    (c) =>
      c.name_simple.toLowerCase().includes(search.toLowerCase()) ||
      String(c.id).includes(search)
  );

  return (
    <div className="quran">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">← Back to site</Link>
        </div>
      </header>

      <div className="container quran__layout">
        {/* Surah list */}
        <aside className="quran__sidebar">
          <input
            className="quran__search"
            placeholder="Search surah…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="quran__list">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  className={`quran__surah${c.id === activeId ? ' active' : ''}`}
                  onClick={() => setActiveId(c.id)}
                >
                  <span className="quran__num">{c.id}</span>
                  <span className="quran__names">
                    <strong>{c.name_simple}</strong>
                    <small>{c.translated_name.name} · {c.verses_count} verses</small>
                  </span>
                  <span className="quran__arabicName">{c.name_arabic}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Reader */}
        <main className="quran__reader">
          {activeChapter && (
            <div className="quran__head">
              <h1>{activeChapter.name_arabic}</h1>
              <p>
                {activeChapter.name_simple} — {activeChapter.translated_name.name} ·{' '}
                {activeChapter.revelation_place} · {activeChapter.verses_count} verses
              </p>
              <div className="quran__reciter-row">
                <label htmlFor="reciter-select" className="quran__reciter-label">
                  Sheikh:
                </label>
                <select
                  id="reciter-select"
                  className="quran__reciter-select"
                  value={reciterId}
                  onChange={(e) => setReciterId(Number(e.target.value))}
                >
                  {RECITERS.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              {audioUrl && (
                <audio ref={audioRef} controls src={audioUrl} className="quran__audio" key={`${activeId}-${reciterId}`}>
                  Your browser does not support audio.
                </audio>
              )}
            </div>
          )}

          {loading && <p className="quran__msg">Loading…</p>}
          {error && <p className="quran__msg quran__msg--err">{error}</p>}

          {!loading && !error && (
            <ol className="quran__verses">
              {verses.map((v) => (
                <li key={v.id} className="quran__verse">
                  <span className="quran__badge">{v.verse_key}</span>
                  <p className="quran__arabic" dir="rtl" lang="ar">{v.text_uthmani}</p>
                  {v.translations?.[0] && (
                    <p className="quran__translation">{clean(v.translations[0].text)}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </main>
      </div>
    </div>
  );
}
