import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { siteFacts } from '../data';
import { FOUNDER_STORY_TEXT, pickFounderStory } from '../i18n/about/founderStory';
import About from '../components/features/marketing/About';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Founder Story Arabic copy fix (human-review-prep package, approved by
// the site owner): the "Why We Built Al-Rahma Academy" section of
// About.jsx — the third and final section of /academy/about's body, after
// the already-localized Mission/Stats and Values sections — was 100%
// hardcoded English literals with no lang branch at all, confirmed live
// on /ar/academy/about. Same fix shape as the earlier Home/Courses/
// Academy/Resources SEO fixes (src/test/homeArabicSeo.test.jsx,
// src/test/coursesArabicSeo.test.jsx, src/test/academyArabicSeo.test.jsx,
// src/test/resourcesArabicCopy.test.jsx), but here the fix is the page's
// own visible body copy, not just meta/SEO text.

const OLD_ENGLISH_STRINGS = [
  'I am an Egyptian educator who moved to Europe',
  'That frustration became Al-Rahma Academy',
  'every tutor must be someone I would trust to teach my own children',
  'Today,',
  'families across',
  'countries trust us with the most important thing they own',
  "We didn't build a platform. We built the academy we needed and couldn't find.",
];

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

describe('About founder story: real Arabic, not an English fallback', () => {
  afterEach(() => cleanup());

  it('English (/academy/about): every string is byte-for-byte identical to the original text', () => {
    const { container } = renderHarness('/academy/about');
    const founder = container.querySelector('.founder');
    expect(founder.querySelector('.eyebrow').textContent).toBe('Our Story');
    expect(founder.querySelector('.founder__title').textContent).toBe('Why We Built Al-Rahma Academy');

    const bodies = Array.from(founder.querySelectorAll('.founder__body')).map((p) => p.textContent.trim());
    expect(bodies[0]).toBe(
      'I am an Egyptian educator who moved to Europe and watched my children struggle to ' +
      'find a qualified Quran teacher — someone who could teach correctly, speak their ' +
      'language, and understand their world. Every option I found was either too expensive, ' +
      'too unreliable, or simply not qualified.',
    );
    expect(bodies[1]).toBe(
      'That frustration became Al-Rahma Academy. We started with a handful of hand-picked ' +
      'Al-Azhar graduates and one clear rule: every tutor must be someone I would trust to ' +
      'teach my own children.',
    );
    // The emphasis markup itself (<strong>) is preserved, not just the flattened text.
    const bodyEls = founder.querySelectorAll('.founder__body');
    expect(bodyEls[1].querySelector('strong')?.textContent).toBe(
      'every tutor must be someone I would trust to teach my own children.',
    );
    expect(bodies[3]).toBe("We didn't build a platform. We built the academy we needed and couldn't find.");

    expect(founder.querySelector('.founder__sig-name').textContent).toBe(`— ${siteFacts.founder}, Founder`);
    expect(founder.querySelector('.founder__sig-sub').textContent).toBe('Al-Rahma Academy');
  });

  it('Arabic (/ar/academy/about): every approved Arabic string is present, verbatim', () => {
    const { container } = renderHarness('/ar/academy/about');
    const founder = container.querySelector('.founder');

    expect(founder.querySelector('.eyebrow').textContent).toBe('قصتنا');
    expect(founder.querySelector('.founder__title').textContent).toBe('لماذا أسّسنا أكاديمية الرحمة');

    const bodies = Array.from(founder.querySelectorAll('.founder__body')).map((p) => p.textContent.trim());
    expect(bodies[0]).toBe(
      'أنا معلّم مصري انتقلت إلى أوروبا، ورأيت أبنائي يعانون في إيجاد معلّم قرآن كريم مؤهّل — ' +
      'شخص يُحسن التعليم، ويتحدث لغتهم، ويفهم عالمهم. كل خيار وجدته كان إمّا باهظ التكلفة، ' +
      'أو غير موثوق، أو ببساطة غير مؤهّل.',
    );
    expect(bodies[1]).toBe(
      'تحوّلت هذه المعاناة إلى أكاديمية الرحمة. بدأنا بعدد قليل من خريجي الأزهر المختارين ' +
      'بعناية، وبقاعدة واضحة: أن يكون كل معلّم شخصًا أثق به لتعليم أبنائي.',
    );
    expect(bodies[3]).toBe('لم نبنِ منصة إلكترونية. بل بنينا الأكاديمية التي احتجناها ولم نجدها.');

    expect(founder.querySelector('.founder__sig-name').textContent).toBe('— محمود سامي، المؤسس');
    // Brand name stays untranslated in Arabic too.
    expect(founder.querySelector('.founder__sig-sub').textContent).toBe('Al-Rahma Academy');
  });

  it('Arabic: none of the old long English sentences leak through', () => {
    const { container } = renderHarness('/ar/academy/about');
    const founderText = container.querySelector('.founder').textContent;
    for (const needle of OLD_ENGLISH_STRINGS) {
      expect(founderText).not.toContain(needle);
    }
  });

  it('English: the founder-story copy itself has no Arabic characters (the pre-existing "م س" avatar initials are untouched, out of this fix\'s scope)', () => {
    const { container } = renderHarness('/academy/about');
    const founderContentText = container.querySelector('.founder__content').textContent;
    expect(founderContentText).not.toMatch(/[؀-ۿ]/);
  });

  it('the dynamic siteFacts numbers render inside paragraph 3, in both languages', () => {
    const en = renderHarness('/academy/about');
    const enP3 = Array.from(en.container.querySelectorAll('.founder__body'))[2].textContent;
    expect(enP3).toContain(siteFacts.totalFamilies);
    expect(enP3).toContain(String(siteFacts.countriesServed));
    cleanup();

    const ar = renderHarness('/ar/academy/about');
    const arP3 = Array.from(ar.container.querySelectorAll('.founder__body'))[2].textContent;
    expect(arP3).toContain(siteFacts.totalFamilies);
    expect(arP3).toContain(String(siteFacts.countriesServed));
  });

  it('a legacy language without real founder-story copy (e.g. fr) falls back to the English object, not an invented translation', () => {
    expect(pickFounderStory('fr')).toBe(FOUNDER_STORY_TEXT.en);
    expect(pickFounderStory('de')).toBe(FOUNDER_STORY_TEXT.en);
    expect(Object.keys(FOUNDER_STORY_TEXT)).toEqual(['en', 'ar']);
  });
});

describe('About.jsx source: minimal, scoped diff', () => {
  const aboutSrc = fs.readFileSync(
    path.resolve(__dirname, '../components/features/marketing/About.jsx'),
    'utf8',
  );

  it('imports and calls pickFounderStory(lang), no more hardcoded English founder-story literals', () => {
    expect(aboutSrc).toMatch(/pickFounderStory\(lang\)/);
    expect(aboutSrc).not.toMatch(/Why We Built Al-Rahma Academy/);
    expect(aboutSrc).not.toMatch(/I am an Egyptian educator/);
  });

  it('does not introduce an isAr ? ... : ... branch', () => {
    expect(aboutSrc).not.toMatch(/isAr/);
  });

  it('still reads siteFacts.totalFamilies / countriesServed dynamically — no frozen number', () => {
    expect(aboutSrc).toMatch(/siteFacts\.totalFamilies/);
    expect(aboutSrc).toMatch(/siteFacts\.countriesServed/);
    expect(aboutSrc).not.toMatch(/1,200\+/);
    expect(aboutSrc).not.toMatch(/>10</); // no hardcoded "10 countries" literal in JSX
  });

  it('the Mission/Stats and Values sections above are untouched', () => {
    expect(aboutSrc).toMatch(/a\.heading/);
    expect(aboutSrc).toMatch(/a\.valuesHeading/);
    expect(aboutSrc).toMatch(/values__grid/);
  });

  it('does not touch breadcrumb or JSON-LD — this component renders neither', () => {
    // H1 presence is intentionally not asserted here: a separate, later fix
    // (fix/about-page-h1) added the page's one real H1 to this component.
    // See src/test/aboutPageHeading.test.jsx for that fix's own H1 coverage.
    expect(aboutSrc).not.toMatch(/Breadcrumbs/);
    expect(aboutSrc).not.toMatch(/setJsonLd/);
  });
});
