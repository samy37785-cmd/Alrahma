import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { PAGE_HEADING_TEXT, pickPageHeading } from '../i18n/about/pageHeading';
import About from '../components/features/marketing/About';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// About page H1 structure fix: /academy/about and /ar/academy/about had
// zero <h1> elements — the page's own content started directly at an
// <h2> ("Our Mission & Vision"). This adds the one missing, visible,
// owner-approved page-level H1 (not sr-only/hidden), reusing the
// existing .section-head layout/style already used by the Values
// section below it — no new CSS needed.

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <About />
      </LangProvider>
    </BrowserRouter>,
  );
}

describe('About page: exactly one visible H1, in the visitor\'s language', () => {
  afterEach(() => cleanup());

  it('English (/academy/about): one H1 with the approved English text', () => {
    const { container } = renderHarness('/academy/about');
    const h1s = container.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe('About Al-Rahma Academy');
    // Visible, not hidden/sr-only.
    expect(h1s[0].className).not.toMatch(/sr-only/);
    expect(h1s[0].closest('[hidden]')).toBeNull();
  });

  it('Arabic (/ar/academy/about): one H1 with the approved Arabic text', () => {
    const { container } = renderHarness('/ar/academy/about');
    const h1s = container.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe('من نحن');
    expect(h1s[0].className).not.toMatch(/sr-only/);
    expect(h1s[0].closest('[hidden]')).toBeNull();
  });

  it('no second H1 exists anywhere in the page content, in either language', () => {
    const en = renderHarness('/academy/about');
    expect(en.container.querySelectorAll('h1').length).toBe(1);
    cleanup();

    const ar = renderHarness('/ar/academy/about');
    expect(ar.container.querySelectorAll('h1').length).toBe(1);
  });

  it('the already-localized Founder Story section is still present and unchanged, in both languages', () => {
    const en = renderHarness('/academy/about');
    expect(en.container.querySelector('.founder__title').textContent).toBe('Why We Built Al-Rahma Academy');
    cleanup();

    const ar = renderHarness('/ar/academy/about');
    expect(ar.container.querySelector('.founder__title').textContent).toBe('لماذا أسّسنا أكاديمية الرحمة');
  });

  it('internal section headings (Mission, Values, Founder Story) remain h2, not promoted or demoted', () => {
    const { container } = renderHarness('/academy/about');
    const h2s = container.querySelectorAll('h2');
    expect(h2s.length).toBe(3);
  });

  it('a legacy language without real page-heading copy (e.g. fr) falls back to the English object, not an invented translation', () => {
    expect(pickPageHeading('fr')).toBe(PAGE_HEADING_TEXT.en);
    expect(pickPageHeading('de')).toBe(PAGE_HEADING_TEXT.en);
    expect(Object.keys(PAGE_HEADING_TEXT)).toEqual(['en', 'ar']);
  });
});

describe('About.jsx source: minimal, scoped diff', () => {
  const aboutSrc = fs.readFileSync(
    path.resolve(__dirname, '../components/features/marketing/About.jsx'),
    'utf8',
  );

  it('imports and calls pickPageHeading(lang)', () => {
    expect(aboutSrc).toMatch(/pickPageHeading\(lang\)/);
  });

  it('renders exactly one <h1> in JSX', () => {
    const matches = aboutSrc.match(/<h1[\s>]/g) || [];
    expect(matches.length).toBe(1);
  });

  it('does not introduce an isAr ? ... : ... branch', () => {
    expect(aboutSrc).not.toMatch(/isAr/);
  });

  it('does not touch Mission, Values, or Founder Story text — still reads a.heading, valuesT, and pickFounderStory', () => {
    expect(aboutSrc).toMatch(/a\.heading/);
    expect(aboutSrc).toMatch(/a\.mission/);
    expect(aboutSrc).toMatch(/valuesT/);
    expect(aboutSrc).toMatch(/pickFounderStory\(lang\)/);
  });

  it('does not touch breadcrumb or JSON-LD — this component renders neither', () => {
    expect(aboutSrc).not.toMatch(/Breadcrumbs/);
    expect(aboutSrc).not.toMatch(/setJsonLd/);
  });
});
