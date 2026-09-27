import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta, bodyStrings } from './utils/fullPageRender';
import Home from '../pages/Home';
import AboutPage from '../pages/About';
import CoursesHub from '../pages/hubs/CoursesHub';
import CoursesQuran from '../pages/hubs/CoursesQuran';
import CoursesArabic from '../pages/hubs/CoursesArabic';
import AcademyHub from '../pages/hubs/AcademyHub';
import fr from '../i18n/fr';
import { HOME_SEO_TEXT } from '../i18n/home/seo';
import { COURSES_SEO_TEXT } from '../i18n/courses/seo';
import { ACADEMY_SEO_TEXT } from '../i18n/academy/seo';
import { PAGE_HEADING_TEXT } from '../i18n/about/pageHeading';
import { FOUNDER_STORY_TEXT } from '../i18n/about/founderStory';
import { LEVEL_QUIZ_TEXT } from '../i18n/home/levelQuiz';
import { ISNAD_CHAIN_TEXT } from '../i18n/home/isnadChain';
import { HOME_LEAKED_STRINGS_TEXT, COURSE_OPTION_LABELS_TEXT } from '../i18n/home/leakedStrings';
import { COUNTRY_NAMES_TEXT } from '../i18n/home/countries';
import { A11Y_LABELS_TEXT } from '../i18n/a11yLabels';
import { TEACHERS } from '../data';

// French Localization Batch 1A: /fr/, /fr/courses, /fr/courses/quran,
// /fr/courses/arabic, /fr/academy and /fr/academy/about render French
// metadata, H1 and visible/accessible text, with no English left over.
// EN/AR stay byte-identical: see frenchBatch1aEnArRegression.test.jsx.

useFullPageEnvironment();

const PAGES = [
  { path: '/', Page: Home, title: HOME_SEO_TEXT.fr.title, description: HOME_SEO_TEXT.fr.description, h1: fr.hero.title },
  { path: '/courses', Page: CoursesHub, title: COURSES_SEO_TEXT.hub.fr.title, description: COURSES_SEO_TEXT.hub.fr.description, h1: fr.hubs.courses.heading },
  { path: '/courses/quran', Page: CoursesQuran, title: COURSES_SEO_TEXT.quran.fr.title, description: COURSES_SEO_TEXT.quran.fr.description, h1: fr.hubs.quran.heading },
  { path: '/courses/arabic', Page: CoursesArabic, title: COURSES_SEO_TEXT.arabic.fr.title, description: COURSES_SEO_TEXT.arabic.fr.description, h1: fr.hubs.arabic.heading },
  { path: '/academy', Page: AcademyHub, title: fr.nav.academy, description: ACADEMY_SEO_TEXT.fr.description, h1: fr.hubs.academy.heading },
  { path: '/academy/about', Page: AboutPage, title: fr.about.eyebrow, description: fr.about.description, h1: PAGE_HEADING_TEXT.fr.h1 },
];

// Strings that are legitimately identical in English and French: brand and
// people's names, language codes, currency codes, social networks, Islamic
// terms kept as-is, country names spelled the same, and a citation (book
// name + number). Anything else shared with the English page is a leak.
const TEACHER_NAMES = new Set(TEACHERS.map((t) => t.nameEn));
const SAME_IN_FRENCH = new Set([
  'AL-RAHMA', 'ACADEMY', 'AL-Rahma', 'Al-Rahma Academy', 'Academy.', 'Copyright ©', 'Al-Azhar',
  'EN', 'AR', 'IT', 'ES', 'DE', 'FR', 'EUR', 'USD', 'GBP', 'SAR', 'Ctrl K',
  'Adhkar', 'FAQ', 'Blog', 'Contact', 'Email', 'Newsletter', 'Flexible', 'Excellence',
  'Noorani', 'Huffaz', 'Ijazah', 'France', 'Canada', 'Portugal',
  '— Sahih al-Bukhari 5027', 'alrahmaacademy038@gmail.com',
  'Facebook', 'Instagram', 'YouTube', 'TikTok', 'Snapchat',
]);

function isAllowed(s) {
  const value = s.replace(/^@[a-z-]+: /, '');
  return SAME_IN_FRENCH.has(value) || TEACHER_NAMES.has(value) || !/[A-Za-z]{2}/.test(value);
}

async function stringsAt(path, Page) {
  await mountFullPage(path, Page);
  const strings = bodyStrings();
  cleanup();
  return strings;
}

describe('French Batch 1A pages render French metadata, H1 and text', () => {
  for (const { path, Page, title, description, h1 } of PAGES) {
    const frPath = path === '/' ? '/fr/' : `/fr${path}`;

    it(`${frPath}: lang=fr, dir=ltr, French title/description/OG/H1, self canonical`, async () => {
      await mountFullPage(frPath, Page);
      expect(document.documentElement.lang).toBe('fr');
      expect(document.documentElement.dir).toBe('ltr');
      expect(document.title).toBe(`${title} | AL-Rahma Academy`);
      expect(headMeta('meta[name="description"]')).toBe(description);
      expect(headMeta('meta[property="og:title"]')).toBe(`${title} | AL-Rahma Academy`);
      expect(headMeta('meta[property="og:description"]')).toBe(description);
      const h1s = [...document.querySelectorAll('h1')].map((el) => el.textContent.replace(/\s+/g, ' ').trim());
      expect(h1s).toEqual([h1]);
      expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href'))
        .toBe(`https://al-rahmaacademy.com${frPath}`);
    });

    it(`${frPath}: no text or accessibility label is left in English`, async () => {
      const en = await stringsAt(path, Page);
      const frStrings = await stringsAt(frPath, Page);
      const leaks = [...frStrings].filter((s) => en.has(s) && !isAllowed(s));
      expect(leaks).toEqual([]);
    });
  }

  // French glossary (owner decision D2): "tajwid" and "ijaza", never the
  // English transliterations "Tajweed" / "Ijazah", anywhere on a Batch 1A
  // page — text, accessibility labels, <option>s, <title> and <meta>.
  it('Batch 1A pages use the French glossary: no "Tajweed" or "Ijazah" anywhere', async () => {
    const found = [];
    const scan = (where) => {
      const strings = [...bodyStrings(), document.title,
        ...[...document.querySelectorAll('option')].map((o) => o.textContent),
        ...[...document.head.querySelectorAll('meta[content]')].map((m) => m.getAttribute('content'))];
      for (const s of strings) if (/tajweed|ijazah/i.test(s)) found.push(`${where}: ${s}`);
    };
    for (const { path, Page } of PAGES) {
      const frPath = path === '/' ? '/fr/' : `/fr${path}`;
      await mountFullPage(frPath, Page);
      scan(frPath);
      if (frPath === '/fr/') {
        for (const goal of [0, 1, 2, 3]) {
          for (const idx of [0, goal, 0]) {
            fireEvent.click(document.querySelectorAll('.lq__opt')[idx]);
            await act(async () => { await vi.advanceTimersByTimeAsync(300); });
          }
          scan(`/fr/ quiz result ${goal}`);
          fireEvent.click(document.querySelector('.lq__restart'));
          await act(async () => { await vi.advanceTimersByTimeAsync(50); });
        }
      }
      cleanup();
    }
    expect(found).toEqual([]);
  });

  it('/fr/: every Level Quiz screen is French, including the result', async () => {
    await mountFullPage('/fr/', Home);
    const text = () => document.querySelector('.lq').textContent;
    expect(text()).toContain(LEVEL_QUIZ_TEXT.fr.steps.arabic.question);
    for (const idx of [0, 2, 0]) {
      fireEvent.click(document.querySelectorAll('.lq__opt')[idx]);
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    }
    expect(text()).toContain(LEVEL_QUIZ_TEXT.fr.recommendations.ijazah.title);
    expect(text()).toContain(LEVEL_QUIZ_TEXT.fr.retakeBtn);
    expect(text()).not.toContain(LEVEL_QUIZ_TEXT.en.recommendations.ijazah.title);
  });
});

describe('French text modules: complete, faithful, nothing invented', () => {
  const MODULES = {
    LEVEL_QUIZ_TEXT,
    ISNAD_CHAIN_TEXT,
    HOME_LEAKED_STRINGS_TEXT,
    COURSE_OPTION_LABELS_TEXT,
    COUNTRY_NAMES_TEXT,
    FOUNDER_STORY_TEXT,
    HOME_SEO_TEXT,
    ACADEMY_SEO_TEXT,
    PAGE_HEADING_TEXT,
    COURSES_SEO_TEXT_hub: COURSES_SEO_TEXT.hub,
    COURSES_SEO_TEXT_quran: COURSES_SEO_TEXT.quran,
    COURSES_SEO_TEXT_arabic: COURSES_SEO_TEXT.arabic,
  };

  function leaves(obj, prefix = '') {
    return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object'
      ? leaves(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, v]]));
  }

  // Values allowed to be identical to English (proper nouns, brand).
  const SAME_VALUE_OK = new Set([
    'Canada', 'France', 'Portugal', 'Al-Rahma Academy', '— Sahih al-Bukhari 5027', 'Cours',
  ]);

  for (const [name, mod] of Object.entries(MODULES)) {
    it(`${name}: fr has the same keys as en, and no value is left in English`, () => {
      expect(mod.fr, `${name}.fr`).toBeDefined();
      const en = Object.fromEntries(leaves(mod.en));
      const frLeaves = Object.fromEntries(leaves(mod.fr));
      const extra = Object.keys(frLeaves).filter((k) => !(k in en));
      const missing = Object.keys(en).filter((k) => !(k in frLeaves) && en[k] !== null);
      expect(extra, `${name}: fr keys not in en`).toEqual([]);
      expect(missing, `${name}: en keys missing from fr`).toEqual([]);
      const untranslated = Object.keys(en)
        .filter((k) => typeof en[k] === 'string' && frLeaves[k] === en[k] && !SAME_VALUE_OK.has(en[k]));
      expect(untranslated, `${name}: fr values identical to en`).toEqual([]);
    });
  }

  it('a11y labels: fr covers every en label, and Arabic keeps the English labels it rendered before', async () => {
    expect(Object.keys(A11Y_LABELS_TEXT.fr).sort()).toEqual(Object.keys(A11Y_LABELS_TEXT.en).sort());
    const { pickA11yLabels } = await import('../i18n/a11yLabels');
    expect(pickA11yLabels('ar')).toBe(A11Y_LABELS_TEXT.en);
    expect(pickA11yLabels('it')).toBe(A11Y_LABELS_TEXT.en);
    expect(pickA11yLabels('fr')).toBe(A11Y_LABELS_TEXT.fr);
  });

  it('no figure is added or changed: every number in the French text also appears in the English text', () => {
    const numbers = (mod) => new Set(leaves(mod).flatMap(([, v]) => (typeof v === 'string' ? v.match(/\d+/g) || [] : [])));
    for (const [name, mod] of Object.entries(MODULES)) {
      const en = numbers(mod.en);
      const added = [...numbers(mod.fr)].filter((n) => !en.has(n)
        // Same figures, French spacing: "1 400" / "1 000" split the digits.
        && !(name === 'ISNAD_CHAIN_TEXT' && ['1', '400', '000'].includes(n)));
      expect(added, name).toEqual([]);
    }
  });

  it('hadith: French shows a French translation of the English line, not the Arabic and not the English', async () => {
    expect(ISNAD_CHAIN_TEXT.fr.quote).toBe("« Les meilleurs d'entre vous sont ceux qui apprennent le Coran et l'enseignent. »");
    expect(ISNAD_CHAIN_TEXT.fr.citation).toBe(ISNAD_CHAIN_TEXT.en.citation);
    expect(ISNAD_CHAIN_TEXT.fr).not.toHaveProperty('quoteLang');
    await mountFullPage('/fr/', Home);
    const quote = document.querySelector('.isnad__quote');
    expect(quote.textContent.trim()).toBe(ISNAD_CHAIN_TEXT.fr.quote);
    expect(quote.hasAttribute('lang')).toBe(false);
    expect(quote.hasAttribute('dir')).toBe(false);
    expect(document.body.textContent).not.toContain('The best of you');
    expect(document.body.textContent).not.toContain(ISNAD_CHAIN_TEXT.ar.quote);
  });

  it('founder story: the French signature uses the siteFacts founder name', async () => {
    const { siteFacts } = await import('../data/siteFacts');
    expect(FOUNDER_STORY_TEXT.fr.sigLine).toBe(`${siteFacts.founder}, fondateur`);
  });

  it('"Arabic & Italian Alphabet" stays as the existing French source wording until the owner confirms it', () => {
    expect(fr.hubs.arabic.heading).toBe('Alphabet arabe et italien');
  });

  it('it/es/de are still not translated (fall back to English)', async () => {
    const { pickHomeSeo } = await import('../i18n/home/seo');
    const { pickFounderStory } = await import('../i18n/about/founderStory');
    for (const lang of ['it', 'es', 'de']) {
      expect(pickHomeSeo(lang)).toBe(HOME_SEO_TEXT.en);
      expect(pickFounderStory(lang)).toBe(FOUNDER_STORY_TEXT.en);
      expect(LEVEL_QUIZ_TEXT[lang]).toBeUndefined();
    }
  });
});
