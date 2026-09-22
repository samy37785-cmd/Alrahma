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

// Same provider/mock pattern as src/test/teacherProfileArabicSeo.test.jsx
// (PR #89) — TeacherProfile renders the real <Header>/<Footer>, which read
// AuthContext/AdminAuthContext directly and throw outside their providers.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

// Language Closure Phase 1 (approved by محمود): every /ar/academy/teachers/:id
// profile showed "نبذة عن Sami" / "سجّل مع Sami" — the localized label
// ("نبذة عن"/"سجّل مع") correctly in Arabic, but the name itself was always
// teacher.nameEn.split(' ')[0], regardless of `lang`. Confirmed live on all
// 11 profiles in the Language + SEO Closure Audit. Worse for compound names:
// teacher id=5 ("Abd Allah Ayman") produced "نبذة عن Abd" — not even a real
// first name. Fix: a lang-aware `bioName` (teacher.nameAr in full, never
// split, for Arabic; the existing `firstName` for English, unchanged) feeds
// all three bio-mention spots (hero CTA, "About X" h2, sticky enroll card
// h3). This is a different bug from PR #89 (title/breadcrumb/H1), which
// already used teacher.nameAr correctly — this fix must not touch that.

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

describe('Teacher profile bio names: localized per language, all 11 teachers', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  for (const teacher of TEACHERS) {
    const firstName = teacher.nameEn.split(' ')[0];

    it(`teacher id=${teacher.id}: English profile bio still reads "About ${firstName}" / "Enroll with ${firstName}" — unchanged`, () => {
      const { container } = renderHarness(`/academy/teachers/${teacher.id}`);
      const aboutHeading = [...container.querySelectorAll('h2')].find((h) => h.textContent.startsWith('About '));
      expect(aboutHeading.textContent).toBe(`About ${firstName}`);

      const enrollCardHeading = container.querySelector('.tp__enroll-body h3');
      expect(enrollCardHeading.textContent).toBe(`Enroll with ${firstName}`);

      const heroButton = screen.getByRole('button', { name: new RegExp(`Enroll with ${firstName}`) });
      expect(heroButton).toBeInTheDocument();
    });

    it(`teacher id=${teacher.id}: Arabic profile (/ar/...) bio uses the full Arabic name "${teacher.nameAr}", never nameEn or a split first name`, () => {
      const { container } = renderHarness(`/ar/academy/teachers/${teacher.id}`);

      const aboutHeading = [...container.querySelectorAll('h2')].find((h) => h.textContent.startsWith('نبذة عن'));
      expect(aboutHeading.textContent).toBe(`نبذة عن ${teacher.nameAr}`);
      expect(aboutHeading.textContent).not.toContain(teacher.nameEn);
      expect(aboutHeading.textContent).not.toContain(firstName);

      const enrollCardHeading = container.querySelector('.tp__enroll-body h3');
      expect(enrollCardHeading.textContent).toBe(`سجّل مع ${teacher.nameAr}`);
      expect(enrollCardHeading.textContent).not.toContain(teacher.nameEn);
      expect(enrollCardHeading.textContent).not.toContain(firstName);

      const heroButton = screen.getByRole('button', { name: new RegExp(`سجّل مع ${teacher.nameAr}`) });
      expect(heroButton).toBeInTheDocument();
      expect(heroButton.textContent).not.toContain(teacher.nameEn);
    });
  }

  it('sample: a compound Arabic name (id=5, "عبد الله أيمن") is never truncated to "عبد" in the bio', () => {
    const teacher = TEACHERS.find((t) => t.id === 5);
    const { container } = renderHarness('/ar/academy/teachers/5');
    const aboutHeading = [...container.querySelectorAll('h2')].find((h) => h.textContent.startsWith('نبذة عن'));
    expect(aboutHeading.textContent).toBe(`نبذة عن ${teacher.nameAr}`);
    expect(aboutHeading.textContent).not.toBe('نبذة عن عبد');
  });

  it('PR #89 fix (H1, title, breadcrumb) is unaffected: Arabic H1 and English secondary name still both present', () => {
    const teacher = TEACHERS.find((t) => t.id === 1);
    const { container } = renderHarness('/ar/academy/teachers/1');
    expect(container.querySelector('.tp__name-ar').textContent).toBe(teacher.nameAr);
    expect(container.querySelector('.tp__name-en').textContent).toBe(teacher.nameEn);
    expect(document.title).toContain(teacher.nameAr);
  });
});

describe('TeacherProfile.jsx source: minimal, scoped diff', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../pages/TeacherProfile.jsx'), 'utf8');

  it('derives a lang-aware bioName from the full teacher.nameAr, not a split', () => {
    expect(src).toMatch(/bioName\s*=\s*lang === 'ar' \? teacher\.nameAr : firstName/);
  });

  it('does not apply split(\' \')[0] to the Arabic name anywhere', () => {
    expect(src).not.toMatch(/nameAr\.split\(' '\)\[0\]/);
  });

  it('firstName (English) derivation is untouched', () => {
    expect(src).toMatch(/const firstName = teacher\.nameEn\.split\(' '\)\[0\];/);
  });

  it('all three bio-mention JSX spots use bioName, not firstName directly', () => {
    const matches = src.match(/\{bioName\}/g) || [];
    expect(matches.length).toBe(3);
    expect(src).not.toMatch(/\{tp\.about\} \{firstName\}/);
    expect(src).not.toMatch(/\{tp\.enrollWith\} \{firstName\}/);
  });

  it('does not touch displayName (PR #89), useSEO, breadcrumb, or H1', () => {
    expect(src).toMatch(/const displayName = teacher \? \(lang === 'ar' \? teacher\.nameAr : teacher\.nameEn\) : '';/);
    expect(src).toMatch(/title: teacher \? displayName : 'Teacher'/);
    expect(src).toMatch(/<h1 className="tp__name-ar" dir="rtl">\{teacher\.nameAr\}<\/h1>/);
  });
});
