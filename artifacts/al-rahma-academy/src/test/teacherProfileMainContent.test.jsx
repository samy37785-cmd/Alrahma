import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { TEACHERS } from '../data';
import TeacherProfile from '../pages/TeacherProfile';

// Prerequisite fix for the Teacher Profiles SEO-prerender phase: an
// empirical build test (`npm run build` with all 22 teacher-profile
// entries temporarily added to scripts/prerender-routes.mjs) failed at the
// very first entry with a real `page.waitForFunction` timeout inside
// prerender.mjs's waitForHydratedSeo(), which requires a `#main-content`
// element with non-empty text before treating a page as hydrated —
// TeacherProfile.jsx was the one public page in the whole app whose <main>
// had no id="main-content" (every other page already has it, including
// the skip-link target in App.jsx's LocalizedSkipLink). This test asserts
// the DOM directly (not a source-text/regex check) so it actually proves
// the element the real prerender script queries for exists.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <Routes>
            <Route path="/academy/teachers/:id" element={<TeacherProfile />} />
          </Routes>
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('TeacherProfile main landmark (prerender hydration prerequisite)', () => {
  afterEach(cleanup);

  for (const teacher of TEACHERS) {
    it(`teacher id=${teacher.id}: EN page has exactly one <main id="main-content"> with real content`, () => {
      renderHarness(`/academy/teachers/${teacher.id}`);
      const mains = document.querySelectorAll('main');
      expect(mains.length).toBe(1);
      expect(mains[0].id).toBe('main-content');
      expect(mains[0].textContent.trim().length).toBeGreaterThan(0);
      // Confirmed reachable the same way the real page is: via role + id.
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });

    it(`teacher id=${teacher.id}: AR page (/ar/...) has exactly one <main id="main-content"> with real content`, () => {
      renderHarness(`/ar/academy/teachers/${teacher.id}`);
      const mains = document.querySelectorAll('main');
      expect(mains.length).toBe(1);
      expect(mains[0].id).toBe('main-content');
      expect(mains[0].textContent.trim().length).toBeGreaterThan(0);
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });
  }

  it('does not affect the not-found branch (invalid id keeps its own separate <main>, untouched by this fix)', () => {
    renderHarness('/academy/teachers/999');
    const mains = document.querySelectorAll('main');
    expect(mains.length).toBe(1);
    expect(mains[0].id).toBe('');
  });
});
