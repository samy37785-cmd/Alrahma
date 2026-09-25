import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuranSidebar from '../components/features/quran/QuranSidebar';
import QuranQuickNav from '../components/features/quran/QuranQuickNav';
import { getUI } from '../data/quranLangs';

// Coverage for the production-audit finding: the "Hizb" nav tab was
// rendering the literal English word on the Arabic reader UI because
// data/quranLangs.js's UI.ar entry has no navHizb/hizb keys, so the
// component's own `ui.navHizb || 'Hizb'` fallback always won on ar. Also
// covers the Arabic-chapter-name-should-be-primary fix in the surah list
// (previously Latin name rendered first/bold, Arabic last/not-bold).

const chapters = [
  { id: 1, name_simple: 'Al-Fatihah', name_arabic: 'الفاتحة', translated_name: { name: 'The Opener' }, verses_count: 7 },
  { id: 2, name_simple: 'Al-Baqarah', name_arabic: 'البقرة', translated_name: { name: 'The Cow' }, verses_count: 286 },
];

function renderSidebar(uiLang, navMode = 'surah') {
  return render(
    <QuranSidebar
      navMode={navMode}
      chapters={chapters}
      activeId={1}
      search=""
      pageNum={1}
      juzNum={1}
      hizbNum={1}
      khatmDone={[]}
      filtered={chapters}
      ui={getUI(uiLang)}
      onNavModeChange={() => {}}
      onSurahSelect={() => {}}
      onPageNav={() => {}}
      onJuzNav={() => {}}
      onHizbNav={() => {}}
      onSearchChange={() => {}}
      onKhatmToggle={() => {}}
      onKhatmFromSelect={() => {}}
      onNewKhatm={() => {}}
      open
      onClose={() => {}}
    />,
  );
}

describe('QuranSidebar Arabic navigation labels', () => {
  it('AR: the Hizb tab reads "حزب", not the English word "Hizb"', () => {
    renderSidebar('ar');
    expect(screen.getByRole('button', { name: 'حزب' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hizb' })).not.toBeInTheDocument();
  });

  it('EN: the Hizb tab is unchanged ("Hizb")', () => {
    renderSidebar('en');
    expect(screen.getByRole('button', { name: 'Hizb' })).toBeInTheDocument();
  });

  it('AR hizb-mode list: entries read "حزب N", not "Hizb N"', () => {
    renderSidebar('ar', 'hizb');
    expect(screen.getByText('حزب 1')).toBeInTheDocument();
    expect(screen.queryByText('Hizb 1')).not.toBeInTheDocument();
  });

  it('EN hizb-mode list: entries still read "Hizb N" (unchanged)', () => {
    renderSidebar('en', 'hizb');
    expect(screen.getByText('Hizb 1')).toBeInTheDocument();
  });

  it('AR: the Arabic chapter name is the primary element, before the Latin transliteration, in DOM order', () => {
    const { container } = renderSidebar('ar');
    const firstBtn = container.querySelector('.qlc__surah-btn');
    const arSpan = firstBtn.querySelector('.qlc__sar');
    const latinB = firstBtn.querySelector('.qlc__snames b');
    expect(arSpan.textContent).toBe('الفاتحة');
    expect(latinB.textContent).toBe('Al-Fatihah');
    // Arabic span must precede the Latin name in the DOM for it to read
    // first in the RTL flex row (row direction follows the inherited dir).
    expect(
      arSpan.compareDocumentPosition(latinB) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Arabic name kept bold to match/exceed the Latin name's visual weight.
    expect(arSpan.style.fontWeight).toBe('700');
  });

  it('AR: the Latin transliteration is still present (not deleted), as a secondary label', () => {
    renderSidebar('ar');
    expect(screen.getByText('Al-Fatihah')).toBeInTheDocument();
    expect(screen.getByText('The Opener · 7 آية', { exact: false })).toBeInTheDocument();
  });

  it('EN: surah list order/markup is completely unchanged (Latin first, Arabic last, no inline bold)', () => {
    const { container } = renderSidebar('en');
    const firstBtn = container.querySelector('.qlc__surah-btn');
    const arSpan = firstBtn.querySelector('.qlc__sar');
    const latinB = firstBtn.querySelector('.qlc__snames b');
    expect(
      latinB.compareDocumentPosition(arSpan) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(arSpan.style.fontWeight).toBe('');
  });
});

describe('QuranQuickNav Arabic Hizb label', () => {
  it('AR: typing "h5" shows a "حزب 5" result, not "Hizb 5"', async () => {
    render(
      <QuranQuickNav
        chapters={chapters}
        onClose={() => {}}
        onJumpVerse={() => {}}
        onGoPage={() => {}}
        onGoJuz={() => {}}
        onGoHizb={() => {}}
        onGoSurah={() => {}}
        ui={getUI('ar')}
      />,
    );
    const input = screen.getByPlaceholderText(/./);
    input.focus();
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: 'h5' } });
    expect(screen.getByText('حزب 5')).toBeInTheDocument();
    expect(screen.queryByText('Hizb 5')).not.toBeInTheDocument();
  });

  it('EN: typing "h5" still shows "Hizb 5" (unchanged)', async () => {
    render(
      <QuranQuickNav
        chapters={chapters}
        onClose={() => {}}
        onJumpVerse={() => {}}
        onGoPage={() => {}}
        onGoJuz={() => {}}
        onGoHizb={() => {}}
        onGoSurah={() => {}}
        ui={getUI('en')}
      />,
    );
    const input = screen.getByPlaceholderText(/./);
    input.focus();
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: 'h5' } });
    expect(screen.getByText('Hizb 5')).toBeInTheDocument();
  });
});
