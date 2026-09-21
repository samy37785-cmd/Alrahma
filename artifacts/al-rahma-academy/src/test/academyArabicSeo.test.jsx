import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import useSEO from '../hooks/useSEO';
import { ACADEMY_SEO_TEXT, pickAcademySeo } from '../i18n/academy/seo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Academy hub Arabic SEO fix (2026-09-21): Trust Wave SEO Discovery found
// /academy and /academy/about/teachers already render real Arabic body
// content, but AcademyHub.jsx's meta description stayed the hardcoded
// English literal it passed into useSEO() with no lang branch at all — so
// /ar/academy showed html lang="ar" with an English meta description.
// Same fix shape and same AcademySeoLike-proxy test pattern as the earlier
// Home/Courses SEO fixes (src/test/homeArabicSeo.test.jsx,
// src/test/coursesArabicSeo.test.jsx).
//
// The title is untouched by this fix: AcademyHub.jsx's existing
// `title: t.nav.academy` was already correctly localized (nav.academy is
// "Academy" / "الأكاديمية"), so this harness reads it the same way rather
// than moving it into ACADEMY_SEO_TEXT.

function renderHarness(path_, children) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

function AcademySeoLike() {
  const { t, lang } = useLang();
  const seo = pickAcademySeo(lang);
  useSEO({ title: t.nav.academy, description: seo.description });
  return null;
}

describe('Academy hub SEO metadata: real Arabic, not an English fallback', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('English (/academy): title and meta description are the real English copy, non-empty', () => {
    renderHarness('/academy', <AcademySeoLike />);
    expect(document.title.length).toBeGreaterThan(0);
    expect(document.querySelector('meta[name="description"]').content).toBe(ACADEMY_SEO_TEXT.en.description);
    expect(ACADEMY_SEO_TEXT.en.description.length).toBeGreaterThan(0);
  });

  it('Arabic (/ar/academy): title and meta description are real Arabic copy, not the English string', () => {
    renderHarness('/ar/academy', <AcademySeoLike />);
    expect(document.title.length).toBeGreaterThan(0);
    const description = document.querySelector('meta[name="description"]').content;
    expect(description).toBe(ACADEMY_SEO_TEXT.ar.description);
    expect(description.length).toBeGreaterThan(0);
    expect(description).not.toBe(ACADEMY_SEO_TEXT.en.description);
    // No Latin letters in the Arabic description — it isn't the English string.
    expect(description).not.toMatch(/[a-zA-Z]/);
  });

  it('the Arabic description states only what the page\'s own Arabic body content already says: mission, teachers, policies, free trial — no invented number or promise', () => {
    const { description } = ACADEMY_SEO_TEXT.ar;
    expect(description).toMatch(/مهمتنا/);
    expect(description).toMatch(/معلمونا/);
    expect(description).toMatch(/سياس/);
    expect(description).toMatch(/تجريبية مجانية/);
    expect(description).not.toMatch(/\d/);
  });

  it('the academy name is not duplicated in the real <title>, in either language', () => {
    renderHarness('/academy', <AcademySeoLike />);
    const enOccurrences = document.title.split('AL-Rahma Academy').length - 1;
    expect(enOccurrences).toBe(1);

    renderHarness('/ar/academy', <AcademySeoLike />);
    const arOccurrences = document.title.split('AL-Rahma Academy').length - 1;
    expect(arOccurrences).toBe(1);
  });

  it('a legacy language without real Academy copy (e.g. fr) falls back to the English object, not an invented translation', () => {
    expect(pickAcademySeo('fr')).toBe(ACADEMY_SEO_TEXT.en);
    expect(pickAcademySeo('es')).toBe(ACADEMY_SEO_TEXT.en);
    expect(Object.keys(ACADEMY_SEO_TEXT)).toEqual(['en', 'ar']);
  });
});

describe('AcademyHub.jsx source: reads the unified SEO source, no hardcoded English description', () => {
  const academyHubSrc = fs.readFileSync(path.resolve(__dirname, '../pages/hubs/AcademyHub.jsx'), 'utf8');

  it('imports and calls pickAcademySeo(lang)', () => {
    expect(academyHubSrc).toMatch(/pickAcademySeo\(lang\)/);
  });

  it('no longer has the hardcoded English description literal inline', () => {
    expect(academyHubSrc).not.toMatch(/Learn about Al-Rahma Academy/);
  });

  it('does not introduce a new isAr ? ... : ... branch', () => {
    expect(academyHubSrc).not.toMatch(/isAr/);
  });

  it('title wiring is untouched (still t.nav.academy, not moved into the new source)', () => {
    expect(academyHubSrc).toMatch(/title:\s*t\.nav\.academy/);
  });

  it('still renders every visible section unchanged: hero, breadcrumbs, hub cards, header/footer/whatsapp', () => {
    for (const tag of ['<Header', '<Breadcrumbs', 'hub-hero', 'hub-cards', '<Footer', '<WhatsappFab']) {
      expect(academyHubSrc, tag).toContain(tag);
    }
  });
});
