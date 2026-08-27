import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuranMushafPage from '../components/features/quran/QuranMushafPage';

// Coverage for T20: the mushaf reading viewport is the Quran reader's primary
// interactive surface (tap center to toggle chrome, tap edges to page-turn)
// but previously had no keyboard equivalent at all — not focusable, no role,
// no key handler. Page-turn navigation was already reachable via arrow keys
// globally (useQuranKeyboard.js), so this only needed to add a keyboard path
// for the center "toggle chrome" action.

const verse = {
  verse_key: '1:1',
  juz_number: 1,
  hizb_number: 1,
  page_number: 1,
  text_uthmani: 'بِسْمِ اللَّهِ',
};

function renderPage(props = {}) {
  return render(
    <QuranMushafPage
      verses={[verse]}
      chapters={[]}
      pageNum={1}
      navMode="page"
      fontSize={28}
      showTrans={false}
      ui={{}}
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
      {...props}
    />,
  );
}

describe('QuranMushafPage keyboard accessibility', () => {
  it('the reading viewport is a focusable, labeled, keyboard-operable control', () => {
    renderPage();
    const viewport = screen.getByRole('button', { name: /toggle reading view controls/i });
    expect(viewport).toBeInTheDocument();
    expect(viewport).toHaveAttribute('tabIndex', '0');
  });

  it('Enter toggles chrome visibility, matching the existing center-tap behavior', async () => {
    const user = userEvent.setup();
    const onToggleChrome = vi.fn();
    renderPage({ onToggleChrome });

    const viewport = screen.getByRole('button', { name: /toggle reading view controls/i });
    viewport.focus();
    await user.keyboard('{Enter}');

    expect(onToggleChrome).toHaveBeenCalledTimes(1);
  });

  it('Space toggles chrome visibility too', async () => {
    const user = userEvent.setup();
    const onToggleChrome = vi.fn();
    renderPage({ onToggleChrome });

    const viewport = screen.getByRole('button', { name: /toggle reading view controls/i });
    viewport.focus();
    await user.keyboard(' ');

    expect(onToggleChrome).toHaveBeenCalledTimes(1);
  });

  it('the prev/next nav buttons remain independently keyboard-focusable (native <button>, unaffected by this change)', () => {
    renderPage({ canPrev: true, canNext: true });
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });
});
