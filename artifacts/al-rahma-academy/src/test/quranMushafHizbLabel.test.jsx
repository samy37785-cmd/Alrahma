import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuranMushafPage from '../components/features/quran/QuranMushafPage';
import { AR_NAV_LABELS } from '../i18n/quran/arabicNavigationLabels';

// Mushaf Hizb badge fix (2026-09-27): QuranSidebar.jsx and QuranQuickNav.jsx
// already localize the Hizb label via AR_NAV_LABELS (see that file's own
// comment - src/data/quranLangs.js's UI.ar has no hizb/navHizb key, so the
// `ui.hizb || 'Hizb'` fallback rendered the literal English word "Hizb" on
// the Arabic reader). QuranMushafPage.jsx's own margin badge had the exact
// same unfixed fallback - this pins the fix there too, reusing the same
// AR_NAV_LABELS.hizb constant and the same `ui.dir === 'rtl'` isAr check
// already established in the sibling components, rather than inventing a
// second translation source.

const verse = {
  verse_key: '2:1',
  juz_number: 1,
  hizb_number: 3,
  page_number: 2,
  text_uthmani: 'الٓمٓ',
};

const chapter = { id: 2, name_arabic: 'البقرة', name_simple: 'Al-Baqarah', verses_count: 286, revelation_place: 'madinah' };

function renderPage(ui) {
  return render(
    <QuranMushafPage
      verses={[verse]}
      chapters={[chapter]}
      pageNum={2}
      navMode="page"
      fontSize={28}
      showTrans={false}
      ui={ui}
      isBookmarked={() => false}
      onToggleBookmark={() => {}}
      getBookmark={() => null}
      onPrev={() => {}}
      onNext={() => {}}
      canPrev={false}
      canNext={false}
      chromeHidden={false}
      onToggleChrome={() => {}}
      progressLabel=""
    />,
  );
}

describe('QuranMushafPage margin badge: Hizb label localization', () => {
  it('Arabic (ui.dir === "rtl", real getUI("ar") shape - no hizb key): shows "حزب 3", not the literal English word "Hizb"', () => {
    // Mirrors real src/data/quranLangs.js UI.ar exactly: no `hizb` key, so
    // this exercises the actual fallback path, not an idealized prop.
    renderPage({ dir: 'rtl', juz: 'جزء', page: 'صفحة', verses: 'آية' });
    expect(screen.getByText(`${AR_NAV_LABELS.hizb} 3`)).toBeInTheDocument();
    expect(screen.getByText('حزب 3')).toBeInTheDocument();
    expect(screen.queryByText(/Hizb/)).not.toBeInTheDocument();
  });

  it('English (ui.dir === "ltr", real getUI("en") shape - no hizb key either): still shows "Hizb 3", unchanged', () => {
    renderPage({ dir: 'ltr', juz: 'Juz', page: 'Page', verses: 'verses' });
    expect(screen.getByText('Hizb 3')).toBeInTheDocument();
    expect(screen.queryByText('حزب 3')).not.toBeInTheDocument();
  });

  it('a language that already defines ui.hizb (e.g. fr/de/es/it in quranLangs.js) uses that value directly, bypassing the isAr fallback entirely', () => {
    renderPage({ dir: 'ltr', hizb: 'Hizb', juz: 'Juz’' });
    expect(screen.getByText('Hizb 3')).toBeInTheDocument();
  });

  it('Juz and Page badges are untouched by this fix - still read from ui.juz/ui.page exactly as before', () => {
    renderPage({ dir: 'rtl', juz: 'جزء', page: 'صفحة', verses: 'آية' });
    expect(screen.getByText('جزء 1')).toBeInTheDocument();
    expect(screen.getByText('صفحة 2')).toBeInTheDocument();
  });

  it('this fix does not touch surah naming: the surah banner still shows only the Arabic name, no Latin name was introduced or reordered', () => {
    renderPage({ dir: 'rtl', juz: 'جزء', page: 'صفحة', verses: 'آية' });
    expect(screen.getByText('البقرة')).toBeInTheDocument();
    expect(screen.queryByText('Al-Baqarah')).not.toBeInTheDocument();
  });
});
