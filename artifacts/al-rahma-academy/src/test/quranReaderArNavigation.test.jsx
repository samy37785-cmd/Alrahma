import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuranQuickNav from '../components/features/quran/QuranQuickNav';
import ReadingModeSwitch from '../components/features/quran/ReadingModeSwitch';

// Arabic reader completion fix (2026-09-27): src/data/quranLangs.js's UI.en
// and UI.ar blocks were missing continuousReading/verseByVerse/
// quickNavPlaceholder/jumpToVerse/noResults -- keys that fr/de/es/it already
// had. Because they were missing, BOTH languages silently fell back to the
// hardcoded English defaults baked into ReadingModeSwitch.jsx and
// QuranQuickNav.jsx. English happened to look fine (the fallback text IS
// the correct English copy), but Arabic showed literal English. This test
// exercises the real UI.en/UI.ar shapes (once the 5 keys are added) plus
// QuranQuickNav's own Arabic-primary/Latin-secondary result-label fix.

const chapters = [
  { id: 2, name_arabic: 'البقرة', name_simple: 'Al-Baqarah', translated_name: { name: 'The Cow' }, verses_count: 286 },
  { id: 12, name_arabic: 'يوسف', name_simple: 'Yusuf', translated_name: { name: 'Joseph' }, verses_count: 111 },
];

const UI_EN = {
  dir: 'ltr', page: 'Page', juz: 'Juz',
  continuousReading: 'Continuous Reading', verseByVerse: 'Verse by Verse',
  quickNavPlaceholder: 'Go to… e.g. 18:10, p400, j15, h20, or a surah name',
  jumpToVerse: 'Jump to', noResults: 'No matches',
};

const UI_AR = {
  dir: 'rtl', page: 'صفحة', juz: 'جزء',
  continuousReading: 'القراءة المتصلة', verseByVerse: 'آية بآية',
  quickNavPlaceholder: 'اذهب إلى… مثال: 18:10…',
  jumpToVerse: 'الذهاب إلى الآية', noResults: 'لا نتائج',
};

const noop = () => {};

function renderQuickNav(ui) {
  return render(
    <QuranQuickNav
      chapters={chapters}
      ui={ui}
      onClose={noop}
      onJumpVerse={noop}
      onGoPage={noop}
      onGoJuz={noop}
      onGoHizb={noop}
      onGoSurah={noop}
    />,
  );
}

describe('QuranQuickNav Arabic localization', () => {
  it('AR placeholder is the localized Arabic string, no English text', () => {
    renderQuickNav(UI_AR);
    expect(screen.getByPlaceholderText('اذهب إلى… مثال: 18:10…')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Go to/)).not.toBeInTheDocument();
  });

  it('EN placeholder stays exactly as before', () => {
    renderQuickNav(UI_EN);
    expect(screen.getByPlaceholderText('Go to… e.g. 18:10, p400, j15, h20, or a surah name')).toBeInTheDocument();
  });

  it('AR: typing an exact surah number shows the Arabic name first, Latin name second', () => {
    renderQuickNav(UI_AR);
    fireEvent.change(screen.getByPlaceholderText('اذهب إلى… مثال: 18:10…'), { target: { value: '2' } });
    expect(screen.getByText('2. البقرة — Al-Baqarah')).toBeInTheDocument();
    expect(screen.queryByText('2. Al-Baqarah')).not.toBeInTheDocument();
  });

  it('EN: typing an exact surah number is unchanged (Latin name only, no Arabic name added)', () => {
    renderQuickNav(UI_EN);
    fireEvent.change(screen.getByPlaceholderText('Go to… e.g. 18:10, p400, j15, h20, or a surah name'), { target: { value: '2' } });
    expect(screen.getByText('2. Al-Baqarah')).toBeInTheDocument();
  });

  it('AR: free-text surah search shows Arabic name first, Latin name second', () => {
    renderQuickNav(UI_AR);
    fireEvent.change(screen.getByPlaceholderText('اذهب إلى… مثال: 18:10…'), { target: { value: 'Yusuf' } });
    expect(screen.getByText('12. يوسف — Yusuf')).toBeInTheDocument();
  });

  it('EN: free-text surah search keeps the original Latin-first order, unchanged', () => {
    renderQuickNav(UI_EN);
    fireEvent.change(screen.getByPlaceholderText('Go to… e.g. 18:10, p400, j15, h20, or a surah name'), { target: { value: 'Yusuf' } });
    expect(screen.getByText('12. Yusuf — يوسف')).toBeInTheDocument();
  });

  it('AR: "no results" message is localized', () => {
    renderQuickNav(UI_AR);
    fireEvent.change(screen.getByPlaceholderText('اذهب إلى… مثال: 18:10…'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('لا نتائج')).toBeInTheDocument();
  });
});

describe('ReadingModeSwitch Arabic localization', () => {
  it('AR: both tabs are Arabic, no leftover English text', () => {
    render(<ReadingModeSwitch mode="continuous" onChange={noop} ui={UI_AR} />);
    expect(screen.getByText('القراءة المتصلة')).toBeInTheDocument();
    expect(screen.getByText('آية بآية')).toBeInTheDocument();
    expect(screen.queryByText('Continuous Reading')).not.toBeInTheDocument();
    expect(screen.queryByText('Verse by Verse')).not.toBeInTheDocument();
  });

  it('EN: both tabs are unchanged', () => {
    render(<ReadingModeSwitch mode="continuous" onChange={noop} ui={UI_EN} />);
    expect(screen.getByText('Continuous Reading')).toBeInTheDocument();
    expect(screen.getByText('Verse by Verse')).toBeInTheDocument();
  });
});
