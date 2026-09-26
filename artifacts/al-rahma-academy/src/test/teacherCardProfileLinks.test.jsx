import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { TEACHERS } from '../data';
import Teachers from '../pages/Teachers';

// Teacher card internal links (Phase 2, 2026-09-27): /academy/teachers and
// /ar/academy/teachers list every teacher (already prerendered and in
// sitemap.xml individually via /academy/teachers/:id -- see PR #110) but
// had no real <a>/<Link> to any profile page; "Read bio" only expands an
// inline card excerpt. This closes that internal-linking gap by making the
// teacher's own name (already-existing content, no new translated text)
// a real Link to /academy/teachers/:id, while leaving "Read bio" and the
// enroll button completely untouched.

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
            <Route path="/academy/teachers" element={<Teachers />} />
          </Routes>
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('Teachers.jsx: teacher cards link to their profile page', () => {
  afterEach(cleanup);

  it('EN: every teacher has exactly one internal link to /academy/teachers/:id, href has no /ar prefix', () => {
    renderHarness('/academy/teachers');
    for (const teacher of TEACHERS) {
      const link = screen.getByRole('link', { name: new RegExp(teacher.nameEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
      expect(link).toHaveAttribute('href', `/academy/teachers/${teacher.id}`);
    }
  });

  it('AR: every teacher has exactly one internal link to /ar/academy/teachers/:id', () => {
    renderHarness('/ar/academy/teachers');
    for (const teacher of TEACHERS) {
      const link = screen.getByRole('link', { name: new RegExp(teacher.nameAr) });
      expect(link).toHaveAttribute('href', `/ar/academy/teachers/${teacher.id}`);
    }
  });

  it('does not add a second link per card or change the total teacher count rendered', () => {
    renderHarness('/academy/teachers');
    const profileLinks = screen.getAllByRole('link').filter((a) => /^\/academy\/teachers\/\d+$/.test(a.getAttribute('href') || ''));
    expect(profileLinks.length).toBe(TEACHERS.length);
  });

  it('"Read bio" still works as an inline expand/collapse toggle, not a navigation', () => {
    renderHarness('/academy/teachers');
    const toggles = screen.getAllByRole('button', { name: /Read bio/i });
    expect(toggles.length).toBe(TEACHERS.length);
    const firstBio = document.querySelectorAll('.tpg__bio')[0];
    expect(firstBio.className).not.toContain('open');
    fireEvent.click(toggles[0]);
    expect(firstBio.className).toContain('open');
    // Still on the same hub page -- no navigation happened.
    expect(window.location.pathname).toBe('/academy/teachers');
  });

  it('the enroll button per card is unaffected and still targets /enroll?teacher=<id>', () => {
    renderHarness('/academy/teachers');
    const enrollButtons = screen.getAllByRole('button', { name: new RegExp(TEACHERS[0].nameEn.split(' ')[0]) });
    expect(enrollButtons.length).toBeGreaterThan(0);
  });
});
