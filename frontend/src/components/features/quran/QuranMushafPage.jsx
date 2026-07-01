import { useMemo } from 'react';

const NO_BASMALAH = new Set([1, 9]);

// Real Mushaf pages use Eastern Arabic-Indic numerals for ayah markers.
// This also sidesteps a bidi-reordering artifact: Western digits are the
// "European Number" bidi class, which can visually reorder relative to
// neighbouring Arabic text inside a flowing RTL paragraph; Arabic-Indic
// digits are the "Arabic Number" class and flow correctly in RTL context.
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toArabicDigits = (n) => String(n).split('').map((d) => ARABIC_DIGITS[d] ?? d).join('');

/*
 * QuranMushafPage — premium "continuous Mushaf flow" renderer for Page
 * navigation mode. Verses run inline (justified RTL book text) instead of
 * stacking as separate blocks, inside a decorative frame with margin
 * Juz/Hizb/Page markers and an ornamental surah banner whenever a surah
 * begins on the page. Reuses getVersesByPage's data as-is (Surah/Juz/Hizb
 * modes keep the existing list view in QuranVerseList, which suits study
 * rather than "reading the book").
 */
export default function QuranMushafPage({
  verses, chapters, pageNum, fontSize, showTrans, ui,
  isBookmarked, onToggleBookmark,
}) {
  const segments = useMemo(() => {
    const segs = [];
    verses.forEach((v) => {
      const chapterId = Number(v.verse_key.split(':')[0]);
      const last = segs[segs.length - 1];
      if (last && last.chapterId === chapterId) last.verses.push(v);
      else segs.push({ chapterId, verses: [v] });
    });
    return segs;
  }, [verses]);

  if (!verses.length) return null;

  const first = verses[0];
  const last  = verses[verses.length - 1];
  const juzLabel  = first.juz_number === last.juz_number
    ? `${first.juz_number}` : `${first.juz_number}–${last.juz_number}`;
  const hizbLabel = first.hizb_number === last.hizb_number
    ? `${first.hizb_number}` : `${first.hizb_number}–${last.hizb_number}`;

  return (
    <div className="mushaf-frame">
      <div className="mushaf-margin">
        <span className="mushaf-margin__badge">{ui.juz || 'Juz'} {juzLabel}</span>
        <span className="mushaf-margin__badge mushaf-margin__badge--page">{ui.page || 'Page'} {pageNum}</span>
        <span className="mushaf-margin__badge">{ui.hizb || 'Hizb'} {hizbLabel}</span>
      </div>

      {segments.map((seg) => {
        const chapter   = chapters.find((c) => c.id === seg.chapterId);
        const startsHere = Number(seg.verses[0].verse_key.split(':')[1]) === 1;

        return (
          <div key={seg.chapterId} className="mushaf-segment">
            {chapter && startsHere && (
              <div className="mushaf-surah-banner">
                <span className="mushaf-surah-banner__ar" dir="rtl">{chapter.name_arabic}</span>
                <span className="mushaf-surah-banner__meta">
                  {chapter.verses_count} {ui.verses} · {chapter.revelation_place}
                </span>
              </div>
            )}

            {chapter && startsHere && !NO_BASMALAH.has(seg.chapterId) && (
              <p className="mushaf-basmalah" dir="rtl">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</p>
            )}

            <p className="mushaf-flow" dir="rtl" lang="ar" style={{ fontSize: `${fontSize}px` }}>
              {seg.verses.map((v) => {
                const vNum = Number(v.verse_key.split(':')[1]);
                const bookmarked = isBookmarked?.(v.verse_key);
                return (
                  <span key={v.verse_key} id={`v-${v.verse_key}`} className="mushaf-ayah">
                    {v.text_uthmani}{' '}
                    <button
                      className={`mushaf-ayah-num${bookmarked ? ' bookmarked' : ''}`}
                      onClick={() => onToggleBookmark?.(v)}
                      title={bookmarked ? (ui.removeBookmark || 'Remove bookmark') : (ui.addBookmark || 'Bookmark this verse')}
                    >
                      ۝{toArabicDigits(vNum)}
                    </button>{' '}
                  </span>
                );
              })}
            </p>

            {showTrans && (
              <div className="mushaf-translation" dir="auto">
                {seg.verses.map((v) => v.translations?.[0] && (
                  <p key={v.verse_key}>
                    <b>{v.verse_key}</b> {v.translations[0].text.replace(/<[^>]+>/g, '')}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
