import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Privacy from '../pages/Privacy';

// Production audit (2026-09-22) found /ar/academy/privacy renders PageBar's
// hardcoded English default label ("← Back to site") because Privacy.jsx
// called <PageBar to="/" /> with no label prop at all. Fix: Privacy.jsx now
// passes a real Arabic label itself, matching the "← " prefix convention
// already used for this exact UI pattern on FAQ/Blog/PaymentResult
// (src/i18n/ar.js's backToSite keys), without touching PageBar.jsx or any
// shared i18n file — the override is local to Privacy.jsx only.

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <Privacy />
      </LangProvider>
    </BrowserRouter>,
  );
}

describe('Privacy page PageBar back-to-site link: localized per language', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('English (/academy/privacy): shows the existing English label unchanged, links to "/"', () => {
    renderHarness('/academy/privacy');
    const link = screen.getByRole('link', { name: '← Back to site' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('Arabic (/ar/academy/privacy): shows a real Arabic label, links to "/ar/"', () => {
    renderHarness('/ar/academy/privacy');
    const link = screen.getByRole('link', { name: '← العودة إلى الموقع' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/ar/');
  });

  it('Arabic page never shows the English "Back to site" text', () => {
    renderHarness('/ar/academy/privacy');
    expect(screen.queryByText('← Back to site')).toBeNull();
    expect(screen.queryByText(/Back to site/i)).toBeNull();
  });

  it('renders exactly one back-to-site link (no duplicate arrow / no duplicate link)', () => {
    const ar = renderHarness('/ar/academy/privacy');
    expect(ar.container.querySelectorAll('.quran__bar-inner .btn--ghost').length).toBe(1);
    expect(ar.container.querySelector('.quran__bar-inner .btn--ghost').textContent.match(/←/g).length).toBe(1);
    cleanup();

    const en = renderHarness('/academy/privacy');
    expect(en.container.querySelectorAll('.quran__bar-inner .btn--ghost').length).toBe(1);
    expect(en.container.querySelector('.quran__bar-inner .btn--ghost').textContent.match(/←/g).length).toBe(1);
  });

  it('document direction is rtl on the Arabic page and ltr on the English page (no incorrect RTL leakage)', async () => {
    renderHarness('/ar/academy/privacy');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    cleanup();

    renderHarness('/academy/privacy');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  });

  it('rest of the page content (title, headings, mailto links) is untouched', () => {
    const { container } = renderHarness('/ar/academy/privacy');
    expect(container.querySelector('h1').textContent).toBe('سياسة الخصوصية');
    expect(container.querySelectorAll('a[href^="mailto:"]').length).toBeGreaterThan(0);
  });
});
