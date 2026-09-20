import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import useSEO from '../hooks/useSEO';
import { COURSES_SEO_TEXT, pickCoursesSeo } from '../i18n/courses/seo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Courses hub Arabic SEO fix (2026-09-21): live-browser + code review found
// CoursesHub.jsx, CoursesQuran.jsx and CoursesArabic.jsx each rendered real
// Arabic body content on /ar/courses, /ar/courses/quran and
// /ar/courses/arabic, but <title> and meta description stayed either a
// plain nav-label reuse or a hardcoded English literal with no lang branch
// at all. Same fix shape, and same test shape, as
// src/test/homeArabicSeo.test.jsx — a small CoursesSeoLike proxy exercising
// each page's real useSEO() wiring (useLang() -> lang ->
// pickCoursesSeo(route, lang) -> useSEO({...})) without pulling in
// Header/Footer/breadcrumbs, which need unrelated data/providers.
const ROUTES = ['hub', 'quran', 'arabic'];

function renderHarness(path_, children) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

function CoursesSeoLike({ route }) {
  const { lang } = useLang();
  const seo = pickCoursesSeo(route, lang);
  useSEO({ title: seo.title, description: seo.description, keywords: seo.keywords });
  return null;
}

describe.each(ROUTES)('%s: Courses SEO metadata: real Arabic, not an English fallback', (route) => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('English (/): title and meta description exist, are non-empty, and are the real English copy', () => {
    renderHarness('/', <CoursesSeoLike route={route} />);
    const enText = COURSES_SEO_TEXT[route].en;

    expect(document.title).toBeTruthy();
    expect(document.title).toContain(enText.title);

    const description = document.querySelector('meta[name="description"]').content;
    expect(description).toBeTruthy();
    expect(description).toBe(enText.description);
  });

  it('Arabic (/ar/...): title and meta description exist, are non-empty, and are real Arabic copy — not the English string', () => {
    renderHarness('/ar/', <CoursesSeoLike route={route} />);
    const arText = COURSES_SEO_TEXT[route].ar;
    const enText = COURSES_SEO_TEXT[route].en;

    expect(document.title).toBeTruthy();
    expect(document.title).toContain(arText.title);
    expect(document.title).not.toContain(enText.title);

    const description = document.querySelector('meta[name="description"]').content;
    expect(description).toBeTruthy();
    expect(description).toBe(arText.description);
    expect(description).not.toContain(enText.description);
  });

  it('the academy name is not duplicated in the real <title>, in either language', () => {
    renderHarness('/', <CoursesSeoLike route={route} />);
    const enOccurrences = document.title.split('AL-Rahma Academy').length - 1;
    expect(enOccurrences).toBe(1);

    renderHarness('/ar/', <CoursesSeoLike route={route} />);
    const arOccurrences = document.title.split('AL-Rahma Academy').length - 1;
    expect(arOccurrences).toBe(1);
  });

  it('a legacy language without real Arabic copy (e.g. fr) falls back to the English object, not an invented translation', () => {
    expect(pickCoursesSeo(route, 'fr')).toBe(COURSES_SEO_TEXT[route].en);
    expect(pickCoursesSeo(route, 'es')).toBe(COURSES_SEO_TEXT[route].en);
    expect(Object.keys(COURSES_SEO_TEXT[route])).toEqual(['en', 'ar']);
  });
});

describe('COURSES_SEO_TEXT: each route resolves its own key, never another route\'s content', () => {
  it('hub, quran and arabic each have distinct, non-empty en/ar title+description', () => {
    const seen = new Set();
    for (const route of ROUTES) {
      for (const lang of ['en', 'ar']) {
        const { title, description } = COURSES_SEO_TEXT[route][lang];
        expect(title, `${route}.${lang}.title`).toBeTruthy();
        expect(description, `${route}.${lang}.description`).toBeTruthy();
        const key = `${title}|||${description}`;
        expect(seen.has(key), `${route}.${lang} content must not be reused from another route/lang`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('pickCoursesSeo(route, lang) never cross-contaminates between routes', () => {
    expect(pickCoursesSeo('hub', 'ar')).toBe(COURSES_SEO_TEXT.hub.ar);
    expect(pickCoursesSeo('quran', 'ar')).toBe(COURSES_SEO_TEXT.quran.ar);
    expect(pickCoursesSeo('arabic', 'ar')).toBe(COURSES_SEO_TEXT.arabic.ar);
    expect(pickCoursesSeo('hub', 'ar')).not.toBe(pickCoursesSeo('quran', 'ar'));
    expect(pickCoursesSeo('quran', 'ar')).not.toBe(pickCoursesSeo('arabic', 'ar'));
  });
});

describe('CoursesHub.jsx / CoursesQuran.jsx / CoursesArabic.jsx source: no new isAr ternary, each reads its own key from the unified source', () => {
  const files = {
    hub: path.resolve(__dirname, '../pages/hubs/CoursesHub.jsx'),
    quran: path.resolve(__dirname, '../pages/hubs/CoursesQuran.jsx'),
    arabic: path.resolve(__dirname, '../pages/hubs/CoursesArabic.jsx'),
  };

  it.each(ROUTES)('%s: does not introduce a new isAr ? ... : ... branch', (route) => {
    const src = fs.readFileSync(files[route], 'utf8');
    expect(src).not.toMatch(/isAr/);
  });

  it("hub reads pickCoursesSeo('hub', lang), not another route's key", () => {
    const src = fs.readFileSync(files.hub, 'utf8');
    expect(src).toMatch(/pickCoursesSeo\(\s*['"]hub['"]\s*,\s*lang\s*\)/);
  });

  it("quran reads pickCoursesSeo('quran', lang), not another route's key", () => {
    const src = fs.readFileSync(files.quran, 'utf8');
    expect(src).toMatch(/pickCoursesSeo\(\s*['"]quran['"]\s*,\s*lang\s*\)/);
  });

  it("arabic reads pickCoursesSeo('arabic', lang), not another route's key", () => {
    const src = fs.readFileSync(files.arabic, 'utf8');
    expect(src).toMatch(/pickCoursesSeo\(\s*['"]arabic['"]\s*,\s*lang\s*\)/);
  });

  it('none of the three pages hardcode the old English title/description literals any more', () => {
    expect(fs.readFileSync(files.hub, 'utf8')).not.toMatch(/description:\s*['"]Explore all online Quran/);
    expect(fs.readFileSync(files.quran, 'utf8')).not.toMatch(/title:\s*['"]Quran & Tajweed Courses['"]/);
    expect(fs.readFileSync(files.arabic, 'utf8')).not.toMatch(/title:\s*['"]Arabic Alphabet Course['"]/);
  });
});
