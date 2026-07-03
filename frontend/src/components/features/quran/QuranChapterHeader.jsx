import { JUZ_NAMES } from '../../../data/quranLangs';

export default function QuranChapterHeader({ navMode, activeChapter, juzNum, pageNum, hizbNum, ui }) {
  return (
    <div className="qlc__chapter-header">
      {(navMode === 'surah' || navMode === 'khatm') && activeChapter ? (
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
