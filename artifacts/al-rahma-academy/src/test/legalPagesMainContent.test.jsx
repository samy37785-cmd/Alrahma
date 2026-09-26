import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Privacy from '../pages/Privacy';
import TermsOfService from '../pages/TermsOfService';
import RefundPolicy from '../pages/RefundPolicy';

// Legal pages prerender prerequisite (2026-09-26): a read-only SEO
// discovery pass found /academy/privacy, /academy/terms and
// /academy/refund-policy are otherwise prerender-ready (fully static
// per-locale content, no fetch/date/random/geolocation/localStorage/auth,
// real title/description/canonical-via-useSEO/H1/Breadcrumbs already) but
// each page's real <main> had no id="main-content" — the same single
// blocker that previously affected TeacherProfile.jsx (see
// teacherProfileMainContent.test.jsx / PR #109) and is required by
// prerender.mjs's waitForHydratedSeo(). This asserts the real DOM (not a
// source-text/regex check) so it actually proves the element the
// prerender script queries for exists, exactly once, with real content.
//
// TermsOfService.jsx and RefundPolicy.jsx render the site <Header/>, which
// pulls in Auth/Query machinery unrelated to this task's scope — stubbed
// out the same way trustMarketingHeroFooterAbout.test.jsx already does for
// Teachers.jsx. Privacy.jsx uses PageBar instead of Header, so it needs no
// such stub.
vi.mock('../components/layout/Header', () => ({ default: () => <div /> }));
vi.mock('../components/layout/Footer', () => ({ default: () => <div /> }));

function renderHarness(path_, Component) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <Component />
      </LangProvider>
    </BrowserRouter>,
  );
}

function assertSingleMainContentLandmark() {
  const mains = document.querySelectorAll('main');
  expect(mains.length).toBe(1);
  expect(mains[0].id).toBe('main-content');
  expect(mains[0].textContent.trim().length).toBeGreaterThan(0);
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
}

describe('Legal pages main landmark (prerender hydration prerequisite)', () => {
  afterEach(cleanup);

  const pages = [
    { name: 'Privacy', Component: Privacy, en: '/academy/privacy', ar: '/ar/academy/privacy' },
    { name: 'TermsOfService', Component: TermsOfService, en: '/academy/terms', ar: '/ar/academy/terms' },
    { name: 'RefundPolicy', Component: RefundPolicy, en: '/academy/refund-policy', ar: '/ar/academy/refund-policy' },
  ];

  for (const { name, Component, en, ar } of pages) {
    it(`${name}: EN page has exactly one <main id="main-content"> with real content`, () => {
      renderHarness(en, Component);
      assertSingleMainContentLandmark();
    });

    it(`${name}: AR page (${ar}) has exactly one <main id="main-content"> with real content`, () => {
      renderHarness(ar, Component);
      assertSingleMainContentLandmark();
    });
  }
});
