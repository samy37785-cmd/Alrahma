import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import useSEO from '../hooks/useSEO';
import { Success } from '../components/features/enrollment/EnrollWizard';
import { ENROLL_SEO_TEXT, pickEnrollSeo } from '../i18n/enroll/seo';

// Post-booking journey fix (2026-09-20): a live-browser review found two
// real defects in Enroll's post-booking experience:
//
// 1. The success screen's "Go to Dashboard" button sent a fresh,
//    unauthenticated visitor straight into ProtectedRoute's /login
//    redirect - Booking-First Enrollment (docs/current-project-status.md
//    §5) never creates an account/session at booking time, so there was
//    never a real dashboard for that visitor to land on. It's removed
//    outright here, not replaced with any login/account gate.
// 2. Enroll.jsx passed a single hardcoded English title/description into
//    useSEO() with no lang branch, so <title> and meta description stayed
//    English even on /ar/enroll while the rest of the page (labels, h1,
//    form) was already fully Arabic.
//
// This file proves both fixes hold, following the same renderHarness/
// basename pattern as LangContext.test.jsx and the same Success-rendering
// pattern as EnrollWizard.homeNavigation.test.jsx.

function renderHarness(path, children) {
  window.history.replaceState({}, '', path);
  const { basename } = langFromPath(path);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

describe('Enroll success state: no dashboard, honest post-booking options only', () => {
  afterEach(cleanup);

  it('English: no "Go to Dashboard" (or any /dashboard) link/button, WhatsApp + Back to Home remain', () => {
    renderHarness('/enroll', <Success name="Amina" bookingRef="ABC123" />);
    expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /message us on whatsapp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
  });

  it('Arabic: no dashboard reference either, and the WhatsApp/admin-contact explanation is genuinely Arabic', () => {
    const { container } = renderHarness('/ar/enroll', <Success name="أمينة" bookingRef="ABC123" />);
    expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/لوحة التحكم/)).not.toBeInTheDocument();
    // "Our team will contact you on WhatsApp to confirm your schedule and
    // payment" (ar) - the actual honest next step, must still be present.
    // Checked against the container's full text (not getByText) because
    // this sentence is split across a <p>/<strong> pair, and a regex
    // getByText would also match every ancestor's concatenated textContent.
    expect(container.textContent).toMatch(/سيتواصل معك فريقنا عبر واتساب لتأكيد جدولك والدفع/);
    expect(screen.getByRole('link', { name: /راسلنا عبر واتساب/ })).toBeInTheDocument();
  });
});

describe('Enroll SEO metadata: real Arabic, not an English fallback', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  // Mirrors Enroll.jsx's own useSEO wiring exactly (useLang() -> lang ->
  // pickEnrollSeo(lang) -> useSEO({...})) without pulling in Header/Footer,
  // which need providers unrelated to this fix (auth, etc.).
  function EnrollSeoLike() {
    const { lang } = useLang();
    const seo = pickEnrollSeo(lang);
    useSEO({ title: seo.title, description: seo.description, keywords: seo.keywords });
    return null;
  }

  it('English (/enroll): title and meta description are the real English copy', () => {
    renderHarness('/enroll', <EnrollSeoLike />);
    expect(document.title).toContain(ENROLL_SEO_TEXT.en.title);
    expect(document.querySelector('meta[name="description"]').content).toBe(ENROLL_SEO_TEXT.en.description);
  });

  it('Arabic (/ar/enroll): title and meta description are real Arabic copy, not the English string', () => {
    renderHarness('/ar/enroll', <EnrollSeoLike />);
    expect(document.title).toContain(ENROLL_SEO_TEXT.ar.title);
    expect(document.querySelector('meta[name="description"]').content).toBe(ENROLL_SEO_TEXT.ar.description);
    expect(document.title).not.toContain(ENROLL_SEO_TEXT.en.title);
  });

  it('the Arabic copy states a free trial + booking request + admin contact on WhatsApp for schedule/payment - no instant payment, subscription, or dashboard claim', () => {
    const { description } = ENROLL_SEO_TEXT.ar;
    expect(description).toMatch(/مجانية/);
    expect(description).toMatch(/واتساب/);
    expect(description).not.toMatch(/لوحة التحكم/);
    expect(description).not.toMatch(/اشتراك/);
  });

  it('a legacy language without real Enroll copy (e.g. fr) falls back to the English object, not an invented translation', () => {
    expect(pickEnrollSeo('fr')).toBe(ENROLL_SEO_TEXT.en);
    expect(pickEnrollSeo('es')).toBe(ENROLL_SEO_TEXT.en);
    expect(Object.keys(ENROLL_SEO_TEXT)).toEqual(['en', 'ar']);
  });
});

// Sanity check with MemoryRouter too (no window.location coupling), proving
// the dashboard-link assertion isn't accidentally vacuous against a stale
// DOM from a previous test.
describe('sanity: the old markup would have failed the "no dashboard" check', () => {
  afterEach(cleanup);

  it('a fixture with a real dashboard link fails the same assertion style used above', () => {
    render(
      <MemoryRouter>
        <a href="/dashboard">Go to Dashboard</a>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/dashboard/i)).toBeInTheDocument();
    cleanup();
  });
});
