import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { TEACHERS } from '../data';
import TeacherProfile from '../pages/TeacherProfile';

// Production-audit finding: TeacherProfile.jsx's H1 was ALWAYS
// teacher.nameAr, even on lang="en" pages -- a real H1/document-language
// SEO mismatch (the English page's own main heading was not in English).
// Fix: the <h1>/<p> roles now swap by locale (EN page: H1 = nameEn,
// secondary <p> = nameAr; AR page: H1 = nameAr, secondary <p> = nameEn).
// Same mock pattern as teacherProfileArabicSeo.test.jsx (PR #89): Header/
// Footer need Auth/AdminAuth context, mocked as signed-out/non-admin.
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

function breadcrumbSchema() {
  const el = document.head.querySelector('script[data-seo="breadcrumb"]');
  return el ? JSON.parse(el.textContent) : null;
}

describe('Teacher profile H1 locale (all 11 teachers)', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  for (const teacher of TEACHERS) {
    it(`teacher id=${teacher.id}: EN page — H1 is nameEn, no Arabic H1`, () => {
      renderHarness(`/academy/teachers/${teacher.id}`);

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.textContent).toBe(teacher.nameEn);
      expect(h1.textContent).not.toBe(teacher.nameAr);
      expect(h1).not.toHaveAttribute('dir', 'rtl');

      // The Arabic name is still shown, just no longer as H1.
      expect(screen.getByText(teacher.nameAr)).toBeInTheDocument();

      // PR #89's title/breadcrumb fix stays intact.
      expect(document.title).toContain(teacher.nameEn);
      const current = screen.getByLabelText(/current page/i);
      expect(current.textContent).toBe(teacher.nameEn);
      expect(breadcrumbSchema().itemListElement.at(-1).name).toBe(teacher.nameEn);
    });

    it(`teacher id=${teacher.id}: AR page (/ar/...) — H1 is nameAr, no English name inside the H1`, () => {
      renderHarness(`/ar/academy/teachers/${teacher.id}`);

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.textContent).toBe(teacher.nameAr);
      expect(h1.textContent).not.toContain(teacher.nameEn);
      expect(h1).toHaveAttribute('dir', 'rtl');

      // The English name is still shown, just no longer as H1.
      expect(screen.getByText(teacher.nameEn)).toBeInTheDocument();

      // PR #89's title/breadcrumb fix stays intact.
      expect(document.title).toContain(teacher.nameAr);
      expect(document.title).not.toContain(teacher.nameEn);
      const current = screen.getByLabelText(/الصفحة الحالية/);
      expect(current.textContent).toBe(teacher.nameAr);
      expect(breadcrumbSchema().itemListElement.at(-1).name).toBe(teacher.nameAr);
    });
  }

  it('does not touch the Arabic bio heading fixed by PR #97 ("نبذة عن " + full Arabic name)', () => {
    const sami = TEACHERS.find((t) => t.id === 1);
    renderHarness('/ar/academy/teachers/1');
    expect(screen.getByText(`نبذة عن ${sami.nameAr}`)).toBeInTheDocument();
  });

  it('does not touch the English "About " bio heading', () => {
    const sami = TEACHERS.find((t) => t.id === 1);
    renderHarness('/academy/teachers/1');
    expect(screen.getByText(`About ${sami.nameEn.split(' ')[0]}`)).toBeInTheDocument();
  });
});
