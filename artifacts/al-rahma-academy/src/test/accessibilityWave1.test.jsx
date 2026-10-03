import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, within, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Home from '../pages/Home';
import Enroll from '../pages/Enroll';
import AlphabetLearner from '../components/features/tools/AlphabetLearner';
import { alphabetGroups } from '../data';
import { LEVEL_QUIZ_STEPS } from '../data/home/levelQuiz';
import { pickA11yLabels } from '../i18n/a11yLabels';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Accessibility Wave 1 (jsdom half): markup and semantics only. The rendered
// geometry and contrast of the same fixes are measured in a real browser in
// accessibilityWave1.layout.test.js.
//
//   1. header CTA contrast        -> layout test (computed colours)
//   2. header brand accessible name   (here)
//   3. LevelQuiz progress semantics   (here)
//   4. alphabet dot tap targets   -> markup here, boxes in layout test
//   5. Enroll eyebrow contrast    -> markup here, colours in layout test

useFullPageEnvironment();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

const LOCALES = [
  { lang: 'en', home: '/', enroll: '/enroll' },
  { lang: 'ar', home: '/ar/', enroll: '/ar/enroll' },
  { lang: 'fr', home: '/fr/', enroll: '/fr/enroll' },
  { lang: 'it', home: '/it/', enroll: '/it/enroll' },
];

const brandLink = () => document.querySelector('a.header__brand-link');
const flush = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('2. header brand link: accessible name is the visible name, once', () => {
  for (const { lang, home } of LOCALES) {
    it(`${lang}: the name is the visible wordmark (no mismatching aria-label), and it links to ${home}`, async () => {
      await mountFullPage(home, Home);
      const link = brandLink();
      expect(link).not.toBeNull();
      expect(link.hasAttribute('aria-label')).toBe(false);
      expect(link.getAttribute('href')).toBe(home);

      const name = within(document.querySelector('header.header')).getByRole('link', { name: /AL-RAHMA/i });
      expect(name).toBe(link);
      const visible = link.textContent.replace(/\s+/g, ' ').trim();
      // label-in-name: the whole visible text is part of the name.
      expect(visible).toMatch(/AL-RAHMA/);
      expect(visible).toMatch(/ACADEMY/);
      expect(visible).toContain('أكاديمية الرحمة');
      // The name is not read twice: the brand wordmark appears once in the link.
      expect((visible.match(/AL-RAHMA/g) || []).length).toBe(1);
      // The wordmark is not hidden from the accessibility tree.
      expect(link.querySelector('.brand-lockup__text')?.closest('[aria-hidden="true"]')).toBeNull();
      cleanup();
    });
  }
});

describe('3. LevelQuiz progress: a real progressbar with numeric values', () => {
  const total = LEVEL_QUIZ_STEPS.length;

  for (const { lang, home } of LOCALES) {
    it(`${lang}: progressbar values at the start, middle and end of the quiz`, async () => {
      await mountFullPage(home, Home);
      const labels = pickA11yLabels(lang);
      const bar = () => document.querySelector('.lq__progress');

      const heading = document.querySelector('.lq__heading');
      expect(heading.id).toBeTruthy();

      const check = (n) => {
        const el = bar();
        expect(el.getAttribute('role')).toBe('progressbar');
        expect(el.getAttribute('aria-valuemin')).toBe('1');
        expect(el.getAttribute('aria-valuemax')).toBe(String(total));
        expect(el.getAttribute('aria-valuenow')).toBe(String(n));
        expect(el.getAttribute('aria-valuetext')).toBe(labels.quizProgress(n, total));
        expect(el.getAttribute('aria-labelledby')).toBe(heading.id);
        // No aria-label left behind on a plain div.
        expect(el.hasAttribute('aria-label')).toBe(false);
        // The accessible name is the quiz heading.
        expect(within(document.body).getByRole('progressbar', { name: heading.textContent })).toBe(el);
      };

      check(1);
      expect(total).toBeGreaterThanOrEqual(3);
      // Answer step 1 -> step 2 (a middle step), then through to the last step.
      for (let n = 2; n <= total; n += 1) {
        fireEvent.click(document.querySelector('.lq__opt'));
        await flush(250);
        check(n);
        if (n === 2 || n === total) {
          // Values come from the live step, not a constant.
          expect(bar().getAttribute('aria-valuenow')).toBe(String(n));
        }
      }
      cleanup();
    });
  }
});

describe('4. alphabet learner stylesheet is loaded with the component', () => {
  it('AlphabetLearner imports alphabet.css, and the alpha rules no longer live in the code-split hifz.css', () => {
    expect(read('components/features/tools/AlphabetLearner.jsx')).toMatch(/import ['"]\.\.\/\.\.\/\.\.\/styles\/alphabet\.css['"]/);
    expect(read('styles/alphabet.css')).toContain('.alpha__dot::before');
    expect(read('styles/hifz.css')).not.toMatch(/\.alpha(__|\s|\{)/);
  });
});

describe('4. alphabet progress dots: markup', () => {
  it('renders one button per group, in order, with the existing group labels', async () => {
    await mountFullPage('/it/tools/arabic-alphabet', () => <AlphabetLearner onClose={() => {}} />);
    const dots = [...document.querySelectorAll('.alpha__dots > button.alpha__dot')];
    expect(dots).toHaveLength(alphabetGroups.length);
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(
      alphabetGroups.map((_, i) => `Gruppo ${i + 1}`),
    );
    expect(dots[0].className).toContain('alpha__dot--active');
    expect(dots.filter((d) => d.className.includes('alpha__dot--active'))).toHaveLength(1);
    // Keyboard: every dot is a native button, so it is in the tab order.
    for (const d of dots) {
      expect(d.tagName).toBe('BUTTON');
      expect(d.tabIndex).toBe(0);
    }
    // Activating a dot still moves to that group (behaviour unchanged).
    fireEvent.click(dots[3]);
    expect(document.querySelector('.alpha__dot--active').getAttribute('aria-label')).toBe('Gruppo 4');
    cleanup();
  });
});

describe('5. Enroll eyebrow: colour comes from the stylesheet, not an inline style', () => {
  for (const { lang, enroll } of LOCALES) {
    it(`${lang}: the eyebrow keeps its text and has no inline colour`, async () => {
      await mountFullPage(enroll, Enroll);
      const eyebrow = document.querySelector('.enroll__header .eyebrow');
      expect(eyebrow).not.toBeNull();
      expect(eyebrow.textContent.trim().length).toBeGreaterThan(0);
      expect(eyebrow.getAttribute('style')).toBeNull();
      cleanup();
    });
  }
});

describe('scope guards', () => {
  it('the five fixes add no copy: Header still reads the same header text object', () => {
    const header = read('components/layout/Header.jsx');
    expect(header).not.toMatch(/aria-label=\{copy\.home\}/);
    expect(header).toContain('className="header__brand-link"');
  });

  it('the manifest is unchanged by this PR (35 Italian, 36 French, 31 Arabic, 31 English routes)', () => {
    const count = (l) => PRERENDER_MANIFEST.filter((e) => e.locale === l).length;
    expect(count('it')).toBe(35);
    expect(count('fr')).toBe(36);
    expect(count('ar')).toBe(31);
    expect(count('en')).toBe(31);
  });
});
