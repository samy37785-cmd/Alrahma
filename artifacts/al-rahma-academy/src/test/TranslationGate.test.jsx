import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath, pathFor } from '../utils/localePath';
import TranslationGate from '../components/ui/TranslationGate';

// Mirrors LangContext.test.jsx's renderHarness() pattern exactly.
function renderHarness(children) {
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

const ROUTE = '/courses/ijazah';

function Gate() {
  return (
    <TranslationGate route={ROUTE}>
      <div>REAL PAGE CONTENT</div>
    </TranslationGate>
  );
}

describe('TranslationGate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the real content unchanged for a published language (en)', () => {
    window.history.replaceState({}, '', ROUTE);
    renderHarness(<Gate />);
    expect(screen.getByText('REAL PAGE CONTENT')).toBeInTheDocument();
  });

  it('renders the real content unchanged for Arabic (not marked draft for this route)', () => {
    window.history.replaceState({}, '', `/ar${ROUTE}`);
    renderHarness(<Gate />);
    expect(screen.getByText('REAL PAGE CONTENT')).toBeInTheDocument();
  });

  it('renders the translation-in-progress fallback (not the real content) for Italian, with a real Italian heading', () => {
    window.history.replaceState({}, '', `/it${ROUTE}`);
    renderHarness(<Gate />);
    expect(screen.queryByText('REAL PAGE CONTENT')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questa pagina non è ancora tradotta' })).toBeInTheDocument();
  });

  it('renders the translation-in-progress fallback for German, with a real German heading and a working English-version link', () => {
    window.history.replaceState({}, '', `/de${ROUTE}`);
    renderHarness(<Gate />);
    expect(screen.queryByText('REAL PAGE CONTENT')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Diese Seite ist noch nicht übersetzt' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Englische Version ansehen' });
    expect(link).toHaveAttribute('href', pathFor(ROUTE, 'en'));
    expect(link).toHaveAttribute('href', ROUTE);
  });

  it('marks the fallback page noindex', () => {
    window.history.replaceState({}, '', `/fr${ROUTE}`);
    renderHarness(<Gate />);
    const robots = document.head.querySelector('meta[name="robots"]');
    expect(robots).toHaveAttribute('content', 'noindex, nofollow');
  });
});
