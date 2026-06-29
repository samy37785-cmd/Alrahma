import TafsirPanel from './TafsirPanel';
import TafsirPicker from './TafsirPicker';

const clean = (html = '') =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

const firstWords = (text, n = 3) => text.split(/\s+/).slice(0, n).join(' ');

export default function QuranVerseList({
  displayVerses, tab, hifzMode, isPlaying, curIdx, navMode, chapters,
  translationId, fontSize, showTrans, revealed, openTafsir, tafsirId,
  tafsirPicker, copiedKey, fromV, repeatCount, playCount, showBasmalah,
  loadingVA, ui, loading, error, jumpVerse,
  onToggleReveal, onToggleTafsir, onCopyVerse, onShareVerse, onShowCard,
  onSetTafsirPicker, onSetTafsirId, onPlayVerseByIndex,
  onJumpVerseChange, onJump,
}) {
  return (
    <>
      {loading && <div className="qlc__loading"><div className="qlc__spinner" /></div>}
      {error && <p className="qlc__error" role="alert">{error}</p>}

      {!loading && !error && displayVerses.length > 0 && (
        <div className="qlc__jump-bar">
          <span className="qlc__jump-label">{ui.jump || 'Jump to verse'}</span>
          <input
            className="qlc__jump-input"
            type="number" min={1} max={displayVerses.length}
            placeholder="1"
            value={jumpVerse}
            onChange={(e) => onJumpVerseChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onJump(jumpVerse); }}
          />
          <span className="qlc__jump-of">/ {displayVerses.length}</span>
          <button className="qlc__jump-btn" onClick={() => onJump(jumpVerse)}>↵ Go</button>
        </div>
      )}

      {!loading && !error && showBasmalah && tab !== 'hifz' && (
        <div className="qlc__basmalah-wrap">
          <p className="qlc__basmalah" dir="rtl">
            بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
          </p>
        </div>
      )}

      {!loading && !error && (
        <div className="qlc__verses-wrap">
          <ol className="qlc__verses" start={tab === 'hifz' ? fromV : 1}>
            {displayVerses.map((v, idx) => {
              const isActive  = tab === 'hifz' && hifzMode === 'repeat' && isPlaying && idx === curIdx;
              const isHidden  = tab === 'hifz' && hifzMode === 'test' && !revealed[v.verse_key];
              const tafsirOn  = tafsirId !== 0 && openTafsir[v.verse_key];
              const prevV     = idx > 0 ? displayVerses[idx - 1] : null;
              const surahBroke = prevV ? v.verse_key.split(':')[0] !== prevV.verse_key.split(':')[0] : true;
              const vNum = Number(v.verse_key.split(':')[1]);

              return (
                <li
                  key={v.id}
                  id={`v-${v.verse_key}`}
                  className={`qlc__verse${isActive ? ' qlc__verse--active' : ''}`}
                >
                  {navMode !== 'surah' && surahBroke && (() => {
                    const ch = chapters.find((c) => c.id === Number(v.verse_key.split(':')[0]));
                    return ch ? (
                      <div className="qlc__divider">
                        <span className="qlc__divider-ar">{ch.name_arabic}</span>
                        <span className="qlc__divider-en">{ch.name_simple}</span>
                      </div>
                    ) : null;
                  })()}

                  {isActive && (
                    <div className="qlc__now-playing">
                      <span className="qlc__np-dot" />
                      <span>Now Playing · {playCount}/{repeatCount}</span>
                    </div>
                  )}

                  <p className="qlc__arabic" dir="rtl" lang="ar" style={{ fontSize: `${fontSize}px` }}>
                    {isHidden
                      ? <><span>{firstWords(v.text_uthmani, 3)}</span><span className="qlc__dots"> ···</span></>
                      : v.text_uthmani
                    }
                    {!isHidden && <span className="qlc__vnum">﴿{vNum}﴾</span>}
                  </p>

                  {translationId && v.translations?.[0] && !isHidden && (showTrans || tab === 'reading') && (
                    <p className="qlc__trans" dir="auto">{clean(v.translations[0].text)}</p>
                  )}

                  <div className="qlc__verse-foot">
                    <span className="qlc__vbadge">{v.verse_key}</span>
                    {navMode !== 'surah' && v.page_number && (
                      <span className="qlc__vmeta">📄{v.page_number} · J{v.juz_number}</span>
                    )}

                    <div className="qlc__verse-actions">
                      <button
                        className={`qlc__actbtn${copiedKey === `copy-${v.verse_key}` ? ' copied' : ''}`}
                        onClick={() => onCopyVerse(v)}
                        title="Copy verse (text + translation)"
                      >
                        {copiedKey === `copy-${v.verse_key}` ? '✓' : '📋'}
                      </button>

                      <button
                        className={`qlc__actbtn${copiedKey === `share-${v.verse_key}` ? ' copied' : ''}`}
                        onClick={() => onShareVerse(v)}
                        title="Copy link to this verse"
                      >
                        {copiedKey === `share-${v.verse_key}` ? '✓' : '🔗'}
                      </button>

                      <button
                        className="qlc__actbtn qlc__actbtn--card"
                        onClick={() => onShowCard?.(v)}
                        title="Share as a verse card"
                      >
                        🖼️
                      </button>

                      {tab === 'hifz' && hifzMode === 'repeat' && (
                        <button
                          className="qlc__actbtn qlc__actbtn--play"
                          onClick={() => onPlayVerseByIndex(idx)}
                          disabled={loadingVA}
                        >▶</button>
                      )}

                      {tab === 'hifz' && hifzMode === 'test' && (
                        <button className="qlc__revealbtn" onClick={() => onToggleReveal(v.verse_key)}>
                          {revealed[v.verse_key] ? ui.hide : ui.reveal}
                        </button>
                      )}

                      {tab === 'reading' && (
                        <button
                          className={`qlc__tafsirbtn${tafsirOn ? ' active' : ''}`}
                          onClick={() => {
                            if (tafsirOn) {
                              onToggleTafsir(v.verse_key);
                            } else if (tafsirId !== 0) {
                              onToggleTafsir(v.verse_key);
                            } else {
                              onSetTafsirPicker(tafsirPicker === v.verse_key ? null : v.verse_key);
                            }
                          }}
                          title="تفسير الآية"
                        >
                          📚 {ui.tafsir}
                        </button>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <div className="qlc__progress-bar">
                      <div className="qlc__progress-fill"
                        style={{ width: `${(playCount / repeatCount) * 100}%` }} />
                    </div>
                  )}

                  {tafsirPicker === v.verse_key && !tafsirOn && (
                    <TafsirPicker
                      onSelect={(tid) => {
                        onSetTafsirId(tid, v.verse_key);
                        onSetTafsirPicker(null);
                      }}
                      onClose={() => onSetTafsirPicker(null)}
                    />
                  )}

                  {tafsirOn && (
                    <TafsirPanel
                      verseKey={v.verse_key}
                      tafsirId={tafsirId}
                      ui={ui}
                      onClose={() => onToggleTafsir(v.verse_key)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </>
  );
}
