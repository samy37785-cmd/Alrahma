import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { TEACHERS } from '../data';
import TeacherProfile from '../pages/TeacherProfile';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TeacherProfile renders the real <Header>/<Footer>, which read
// AuthContext/AdminAuthContext directly and throw outside their providers.
// This fix touches neither component, so — same pattern as
// src/test/Wishlist.test.jsx — mock both as a signed-out, non-admin
// anonymous visitor rather than mounting the full provider stack.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

// Teacher profile Arabic SEO/breadcrumb fix: /academy/teachers/:id already
// renders a real Arabic H1 (teacher.nameAr, by design — see the dual-name
// layout further down the page) but useSEO()'s title and the visible
// breadcrumb's last crumb both unconditionally used teacher.nameEn
// regardless of `lang`, found live on all 11 /ar/academy/teachers/:id
// profiles in the Comprehensive EN/AR Audit Phase 2. Same fix shape as the
// earlier Home/Courses/Academy SEO fixes (src/test/homeArabicSeo.test.jsx,
// src/test/coursesArabicSeo.test.jsx, src/test/academyArabicSeo.test.jsx):
// pick the language-appropriate name once and feed it into both useSEO()
// and <Breadcrumbs>. BreadcrumbList JSON-LD is not touched directly — it's
// built by Breadcrumbs.jsx from the same `items` array rendered visibly, so
// it follows automatically.

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

describe('Teacher profile SEO/breadcrumb: real Arabic name, not an English fallback', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  for (const teacher of TEACHERS) {
    it(`teacher id=${teacher.id}: English profile uses nameEn in title and breadcrumb`, () => {
      renderHarness(`/academy/teachers/${teacher.id}`);
      expect(document.title).toContain(teacher.nameEn);

      const current = screen.getByLabelText(new RegExp(`current page`, 'i'));
      expect(current.textContent).toBe(teacher.nameEn);

      const schema = breadcrumbSchema();
      expect(schema.itemListElement.at(-1).name).toBe(teacher.nameEn);
    });

    it(`teacher id=${teacher.id}: Arabic profile (/ar/...) uses nameAr in title and breadcrumb, never nameEn`, () => {
      renderHarness(`/ar/academy/teachers/${teacher.id}`);

      // Title: real Arabic name present, English name absent.
      expect(document.title).toContain(teacher.nameAr);
      expect(document.title).not.toContain(teacher.nameEn);

      // Visible breadcrumb current crumb: real Arabic name, no English leak.
      const current = screen.getByLabelText(/الصفحة الحالية/);
      expect(current.textContent).toBe(teacher.nameAr);
      expect(current.textContent).not.toContain(teacher.nameEn);

      // BreadcrumbList JSON-LD follows the same visible trail automatically
      // (Breadcrumbs.jsx builds it from `items`, not re-derived here).
      const schema = breadcrumbSchema();
      expect(schema.itemListElement.at(-1).name).toBe(teacher.nameAr);
      expect(schema.itemListElement.at(-1).name).not.toBe(teacher.nameEn);
    });
  }

  it('an invalid teacher id (English) keeps its existing not-found behavior — no breadcrumb, unchanged by this PR', () => {
    renderHarness('/academy/teachers/999');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
  });

  it('an invalid teacher id (Arabic) keeps its existing not-found behavior — no breadcrumb, unchanged by this PR', () => {
    renderHarness('/ar/academy/teachers/999');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
  });
});

describe('TeacherProfile.jsx source: minimal, scoped diff', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../pages/TeacherProfile.jsx'), 'utf8');

  it('derives a single lang-aware displayName instead of an inline isAr branch', () => {
    expect(src).toMatch(/lang === 'ar' \? teacher\.nameAr : teacher\.nameEn/);
    expect(src).not.toMatch(/isAr/);
  });

  it('useSEO title now reads displayName, not the raw nameEn literal', () => {
    expect(src).toMatch(/title:\s*teacher \? displayName : 'Teacher'/);
  });

  it('breadcrumb label now reads displayName', () => {
    expect(src).toMatch(/label:\s*displayName\s*\}/);
  });

  it('does not add manual BreadcrumbList JSON-LD (schema stays derived from Breadcrumbs.jsx alone)', () => {
    expect(src).not.toMatch(/BreadcrumbList/);
    expect(src).not.toMatch(/setJsonLd/);
  });

  it('H1 and the secondary English-name paragraph are untouched — dual-name display stays intentional, not part of this fix', () => {
    expect(src).toMatch(/<h1 className="tp__name-ar" dir="rtl">\{teacher\.nameAr\}<\/h1>/);
    expect(src).toMatch(/<p className="tp__name-en">\{teacher\.nameEn\}<\/p>/);
  });

  it('does not touch noindex, routing, or the not-found branch', () => {
    expect(src).not.toMatch(/noindex/);
    expect(src).toMatch(/tp\.notFound/);
  });
});
