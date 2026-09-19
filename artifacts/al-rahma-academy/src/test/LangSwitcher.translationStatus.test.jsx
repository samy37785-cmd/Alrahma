import { fireEvent, render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import LangSwitcher from '../components/ui/LangSwitcher';

// Mirrors LangContext.test.jsx's renderHarness() pattern exactly.
function renderHarness(children) {
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { expanded: false }));
}

const LANG_FULL = { en: 'English', ar: 'العربية', it: 'Italiano', es: 'Español', de: 'Deutsch', fr: 'Français' };

describe('LangSwitcher translation-status badge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the in-progress badge only for it/es/de/fr on a draft page (viewed in French)', () => {
    window.history.replaceState({}, '', '/fr/courses/ijazah');
    renderHarness(<LangSwitcher />);
    openMenu();

    for (const code of ['it', 'es', 'de', 'fr']) {
      const option = screen.getByRole('option', { name: new RegExp(LANG_FULL[code]) });
      expect(within(option).getByText('Traduction en cours')).toBeInTheDocument();
    }
    for (const code of ['en', 'ar']) {
      const option = screen.getByRole('option', { name: new RegExp(LANG_FULL[code]) });
      expect(within(option).queryByText('Traduction en cours')).not.toBeInTheDocument();
    }
  });

  it('shows no badges at all on Home, which has no draft entries this phase', () => {
    window.history.replaceState({}, '', '/');
    renderHarness(<LangSwitcher />);
    openMenu();

    for (const code of Object.keys(LANG_FULL)) {
      const option = screen.getByRole('option', { name: new RegExp(LANG_FULL[code]) });
      expect(option.querySelector('.ls__badge')).not.toBeInTheDocument();
    }
  });
});
