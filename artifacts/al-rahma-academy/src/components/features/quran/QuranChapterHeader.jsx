import { JUZ_NAMES } from '../../../data/quranLangs';

export default function QuranChapterHeader({ navMode, activeChapter, juzNum, pageNum, hizbNum, ui }) {
  // French SEO Publication Wave (2026-09-30): the reader's only <h1>
  // anywhere used to exist solely inside the `activeChapter` branch below,
  // which is empty during scripts/prerender.mjs's own capture (its
  // chapter-list fetch is deliberately skipped there — see Quran.jsx's own
  // comment on why) and, in fact, during every real visitor's very first
  // paint too, before that same fetch resolves — so the page had no <h1>
  // at all for a brief moment on every load, real or prerendered, in every
  // locale, not just this one. prerenderOutput.test.js's generic "every
  // prerendered file has a real <h1>" check (which every other prerendered
  // page already satisfies) surfaced this as a hard prerender blocker for
  // the default (surah) nav mode. Fixed at the source: surah/khatm mode
  // now always renders an <h1> — the real Arabic chapter name once
  // `activeChapter` loads, the page's own general title as a placeholder
  // until then — instead of only ever having one once data arrives.
  const showChapterHeading = (navMode === 'surah' || navMode === 'khatm');
  return (
    <div className="qlc__chapter-header">
      {showChapterHeading && activeChapter ? (
        <>
          <h1 className="qlc__chapter-ar" dir="rtl">{activeChapter.name_arabic}</h1>
          <p className="qlc__chapter-en">
            {activeChapter.name_simple}
            <span className="qlc__chapter-dot"> · </span>
            {activeChapter.translated_name?.name}
            <span className="qlc__chapter-dot"> · </span>
            {activeChapter.revelation_place}
            <span className="qlc__chapter-dot"> · </span>
            {activeChapter.verses_count} {ui.verses}
          </p>
        </>
      ) : showChapterHeading ? (
        <h1 className="qlc__chapter-mode-title">{ui.title || ui.seoTitle}</h1>
      ) : (
        <h2 className="qlc__chapter-mode-title">
          {navMode === 'juz'
            ? `${ui.juz || 'Juz'} ${juzNum} — ${JUZ_NAMES[juzNum - 1] || ''}`
            : navMode === 'hizb'
            ? `${ui.hizb || 'Hizb'} ${hizbNum} — ${ui.juz || 'Juz'} ${Math.ceil(hizbNum / 2)}`
            : `${ui.page || 'Page'} ${pageNum} / 604`}
        </h2>
      )}
    </div>
  );
}
