import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import useSEO from '../hooks/useSEO';
import { HOME_SEO_TEXT, pickHomeSeo } from '../i18n/home/seo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Home Arabic SEO fix (2026-09-20): a live-browser review of production
// found /ar/ already renders real Arabic body content, but <title> and
// meta description stayed the hardcoded English literals Home.jsx passed
// into useSEO() with no lang branch at all. This mirrors the exact shape
// of the earlier Enroll SEO fix (src/test/enrollPostBookingJourney.test.jsx)
// — a small HomeSeoLike proxy exercising Home.jsx's real useSEO() wiring
// (useLang() -> lang -> pickHomeSeo(lang) -> useSEO({...})) without pulling
// in Header/Hero/Tutors/etc., which need unrelated data/providers.
//
// Also guards the specific duplication bug this task called out: useSEO()
// always appends " | AL-Rahma Academy" to whatever title it's given, so a
// title that itself names the academy produces a doubled name in the real
// <title> tag (caught live as "...Al-Rahma Academy | AL-Rahma Academy").

function renderHarness(path_, children) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

function HomeSeoLike() {
  const { lang } = useLang();
  const seo = pickHomeSeo(lang);
  useSEO({ title: seo.title, description: seo.description, keywords: seo.keywords });
  return null;
}

describe('Home SEO metadata: real Arabic, not an English fallback', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('English (/): title and meta description are the real English copy', () => {
    renderHarness('/', <HomeSeoLike />);
    expect(document.title).toContain(HOME_SEO_TEXT.en.title);
    expect(document.querySelector('meta[name="description"]').content).toBe(HOME_SEO_TEXT.en.description);
  });

  it('Arabic (/ar/): title and meta description are real Arabic copy, not the English string', () => {
    renderHarness('/ar/', <HomeSeoLike />);
    expect(document.title).toContain(HOME_SEO_TEXT.ar.title);
    expect(document.querySelector('meta[name="description"]').content).toBe(HOME_SEO_TEXT.ar.description);
    expect(document.title).not.toContain(HOME_SEO_TEXT.en.title);
    expect(document.querySelector('meta[name="description"]').content).not.toContain(HOME_SEO_TEXT.en.description);
  });

  it('the Arabic description states only promises made elsewhere on Home: 1:1 lessons, Quran/Tajweed/Arabic, Al-Azhar tutors, free trial — no new price/subscription/dashboard claim', () => {
    const { description } = HOME_SEO_TEXT.ar;
    expect(description).toMatch(/فردية/);
    expect(description).toMatch(/القرآن/);
    expect(description).toMatch(/الأزهر/);
    expect(description).toMatch(/مجانية/);
    expect(description).not.toMatch(/اشتراك/);
    expect(description).not.toMatch(/لوحة التحكم/);
  });

  it('the academy name is not duplicated in the real <title>, in either language', () => {
    renderHarness('/', <HomeSeoLike />);
    const enOccurrences = document.title.split('AL-Rahma Academy').length - 1;
    expect(enOccurrences).toBe(1);

    renderHarness('/ar/', <HomeSeoLike />);
    const arOccurrences = document.title.split('AL-Rahma Academy').length - 1;
    expect(arOccurrences).toBe(1);
  });

  it('a legacy language without real Home copy (e.g. fr) falls back to the English object, not an invented translation', () => {
    expect(pickHomeSeo('fr')).toBe(HOME_SEO_TEXT.en);
    expect(pickHomeSeo('es')).toBe(HOME_SEO_TEXT.en);
    expect(Object.keys(HOME_SEO_TEXT)).toEqual(['en', 'ar']);
  });
});

describe('Home.jsx source: no new isAr ternary, UI/Trial logic untouched', () => {
  const homeSrc = fs.readFileSync(path.resolve(__dirname, '../pages/Home.jsx'), 'utf8');

  it('does not introduce a new isAr ? ... : ... branch — SEO copy comes from the i18n source instead', () => {
    expect(homeSrc).not.toMatch(/isAr/);
  });

  it('still renders every visible section and the Trial/QuickTrialModal conversion layer, unchanged', () => {
    for (const tag of [
      '<Hero', '<TrustBar', '<LevelQuiz', '<Courses', '<Features', '<Steps', '<Tutors',
      '<IsnadChain', '<TrustBadges', '<Pricing', '<JoinCTA', '<FAQ', '<Trial', '<Newsletter',
      '<Footer', '<WhatsappFab', '<QuickTrialModal', '<ExitIntentPopup',
    ]) {
      expect(homeSrc, tag).toContain(tag);
    }
    expect(homeSrc).toMatch(/trialOpen/);
    expect(homeSrc).toMatch(/onTrialClick/);
  });

  it('SEO wiring reads from pickHomeSeo(lang), not a hardcoded English literal', () => {
    expect(homeSrc).toMatch(/pickHomeSeo\(lang\)/);
    expect(homeSrc).not.toMatch(/title:\s*['"]Learn the Quran Online/);
  });
});
