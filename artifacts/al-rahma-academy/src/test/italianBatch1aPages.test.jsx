import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import Home from '../pages/Home';
import CoursesHub from '../pages/hubs/CoursesHub';
import CoursesQuran from '../pages/hubs/CoursesQuran';
import CoursesArabic from '../pages/hubs/CoursesArabic';
import AcademyHub from '../pages/hubs/AcademyHub';
import itLocale from '../i18n/it';
import en from '../i18n/en';
import ar from '../i18n/ar';
import { HOME_SEO_TEXT } from '../i18n/home/seo';
import { COURSES_SEO_TEXT } from '../i18n/courses/seo';
import { ACADEMY_SEO_TEXT } from '../i18n/academy/seo';
import { LEVEL_QUIZ_TEXT } from '../i18n/home/levelQuiz';
import { ISNAD_CHAIN_TEXT } from '../i18n/home/isnadChain';
import { HOME_LEAKED_STRINGS_TEXT, COURSE_OPTION_LABELS_TEXT } from '../i18n/home/leakedStrings';
import { COUNTRY_NAMES_TEXT } from '../i18n/home/countries';
import { A11Y_LABELS_TEXT } from '../i18n/a11yLabels';
import { TEACHERS } from '../data';

// Italian Batch 1A — Home, Standard SEO Copy & English-Leak Fixes: /it/,
// /it/courses, /it/courses/quran, /it/courses/arabic and /it/academy now
// render Italian metadata, H1 and the ordinary UI strings this batch
// touched (home/seo.js, courses/seo.js, academy/seo.js, home/levelQuiz.js,
// home/leakedStrings.js), with no English left over in those strings.
//
// Out of scope, left untouched, and asserted so here rather than silently
// ignored: home/isnadChain.js (the entire `.isnad` section, hadith
// included) and it.js's hero.verseQuote/hero.verseRef (the Home Quran
// verse card, corrected to the literal English source in Batch 0 — not
// re-touched here). Neither is a target of this batch's English-leak
// scan below; both are asserted byte-identical to what Batch 0 left on
// `main` instead. /academy/about (founderStory.js, about/pageHeading.js)
// and CourseIjazah/CourseIslamicStudies/HadithLibrary/Adhkar/Quran Reader
// are separate, later batches and are not touched or tested here.

useFullPageEnvironment();

const PAGES = [
  { path: '/', Page: Home, title: HOME_SEO_TEXT.it.title, description: HOME_SEO_TEXT.it.description, h1: itLocale.hero.title },
  { path: '/courses', Page: CoursesHub, title: COURSES_SEO_TEXT.hub.it.title, description: COURSES_SEO_TEXT.hub.it.description, h1: itLocale.hubs.courses.heading },
  { path: '/courses/quran', Page: CoursesQuran, title: COURSES_SEO_TEXT.quran.it.title, description: COURSES_SEO_TEXT.quran.it.description, h1: itLocale.hubs.quran.heading },
  { path: '/courses/arabic', Page: CoursesArabic, title: COURSES_SEO_TEXT.arabic.it.title, description: COURSES_SEO_TEXT.arabic.it.description, h1: itLocale.hubs.arabic.heading },
  { path: '/academy', Page: AcademyHub, title: itLocale.nav.academy, description: ACADEMY_SEO_TEXT.it.description, h1: itLocale.hubs.academy.heading },
];

// Strings that are legitimately identical in English and Italian: brand and
// people's names, language/currency codes, social networks, Islamic terms
// kept as-is (matching it.js's own established glossary: "Tajweed" and
// "Ijazah", NOT French's "tajwid"/"ijaza" -- Italian's own convention,
// already published throughout it.js before this batch), and the two
// deliberately-untranslated religious spots this batch does not touch.
const TEACHER_NAMES = new Set(TEACHERS.map((t) => t.nameEn));

// home/countries.js and a11yLabels.js are NOT in this batch's scope (not
// among the five files Batch 1A targets) and have no `it` entry yet --
// same pre-existing gap this project already had for it/es/de before this
// batch, unrelated to it, and left for a later batch. Their English leaf
// values are allow-listed here so the leak scan below stays strict about
// the five files this batch DID touch, without wrongly demanding a
// translation this batch was never asked to add.
function stringLeaves(obj) {
  return Object.values(obj).flatMap((v) => (v && typeof v === 'object' ? stringLeaves(v) : (typeof v === 'string' ? [v] : [])));
}
const OUT_OF_BATCH_STILL_ENGLISH = new Set([
  ...stringLeaves(COUNTRY_NAMES_TEXT.en),
  ...stringLeaves(A11Y_LABELS_TEXT.en),
]);

const SAME_IN_ITALIAN = new Set([
  'AL-RAHMA', 'ACADEMY', 'AL-Rahma', 'Al-Rahma Academy', 'Academy.', 'Copyright ©', 'Al-Azhar',
  'EN', 'AR', 'IT', 'ES', 'DE', 'FR', 'EUR', 'USD', 'GBP', 'SAR', 'Ctrl K',
  'Adhkar', 'FAQ', 'Blog', 'Contact', 'Email', 'Newsletter',
  'Noorani', 'Huffaz', 'Tajweed', 'Ijazah', 'Hifz', 'Sanad', 'Aqeedah', 'Fiqh', 'Seerah', 'Tafsir',
  'Fiqh · Tafsir · Aqeedah', // it.js's own tutors.creds -- already identical in en/it before this batch
  'alrahmaacademy038@gmail.com',
  'Facebook', 'Instagram', 'YouTube', 'TikTok', 'Snapchat',
  ...OUT_OF_BATCH_STILL_ENGLISH,
]);

function isAllowed(s) {
  const value = s.replace(/^@[a-z-]+: /, '');
  // a11yLabels.js's reviewCount(n) => `${n} reviews` and
  // quizProgress(a, b) => `Step ${a} of ${b}` are functions, not string
  // leaves -- same out-of-batch gap as COUNTRY_NAMES_TEXT/
  // A11Y_LABELS_TEXT above, matched by pattern instead.
  if (/^\d+ reviews$/.test(value)) return true;
  if (/^Step \d+ of \d+$/.test(value)) return true;
  return SAME_IN_ITALIAN.has(value) || TEACHER_NAMES.has(value) || !/[A-Za-z]{2}/.test(value);
}

// Same walk as fullPageRender's bodyStrings(), but skipping any text or
// attribute whose nearest ancestor matches `excludeSelector` -- used to
// keep the explicitly out-of-scope IsnadChain section and the Batch-0
// verse card (both required to stay English) out of the leak scan below,
// without weakening it for anything else on the page.
function bodyStringsExcluding(excludeSelector) {
  const out = new Set();
  const isExcluded = (el) => !!el.closest(excludeSelector);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (text && !node.parentElement.closest('script, style, noscript') && !isExcluded(node.parentElement)) {
      out.add(text);
    }
  }
  for (const el of document.body.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
    if (isExcluded(el)) continue;
    for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) {
      const value = el.getAttribute(attr);
      if (value) out.add(`@${attr}: ${value}`);
    }
  }
  return out;
}

const EXCLUDE = '.isnad, .hero__verse';

async function stringsAt(path, Page) {
  await mountFullPage(path, Page);
  const strings = bodyStringsExcluding(EXCLUDE);
  cleanup();
  return strings;
}

describe('Italian Batch 1A pages render Italian metadata, H1 and text', () => {
  for (const { path, Page, title, description, h1 } of PAGES) {
    const itPath = path === '/' ? '/it/' : `/it${path}`;

    it(`${itPath}: lang=it, dir=ltr, Italian title/description/OG/H1, self canonical`, async () => {
      await mountFullPage(itPath, Page);
      expect(document.documentElement.lang).toBe('it');
      expect(document.documentElement.dir).toBe('ltr');
      expect(document.title).toBe(`${title} | AL-Rahma Academy`);
      expect(headMeta('meta[name="description"]')).toBe(description);
      expect(headMeta('meta[property="og:title"]')).toBe(`${title} | AL-Rahma Academy`);
      expect(headMeta('meta[property="og:description"]')).toBe(description);
      const h1s = [...document.querySelectorAll('h1')].map((el) => el.textContent.replace(/\s+/g, ' ').trim());
      expect(h1s).toEqual([h1]);
      expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href'))
        .toBe(`https://al-rahmaacademy.com${itPath}`);
    });

    it(`${itPath}: no text or accessibility label is left in English (outside the untouched IsnadChain section and Batch 0's verse card)`, async () => {
      const enStrings = await stringsAt(path, Page);
      const itStrings = await stringsAt(itPath, Page);
      const leaks = [...itStrings].filter((s) => enStrings.has(s) && !isAllowed(s));
      expect(leaks).toEqual([]);
    });
  }

  it('/it/: every Level Quiz screen is Italian, including the result', async () => {
    await mountFullPage('/it/', Home);
    const text = () => document.querySelector('.lq').textContent;
    expect(text()).toContain(LEVEL_QUIZ_TEXT.it.steps.arabic.question);
    for (const idx of [0, 2, 0]) {
      fireEvent.click(document.querySelectorAll('.lq__opt')[idx]);
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    }
    expect(text()).toContain(LEVEL_QUIZ_TEXT.it.recommendations.ijazah.title);
    expect(text()).toContain(LEVEL_QUIZ_TEXT.it.retakeBtn);
    expect(text()).not.toContain(LEVEL_QUIZ_TEXT.en.recommendations.ijazah.title);
  });

  it('/it/: leaked-string UI (play button, badges, trust-bar stat) is Italian', async () => {
    await mountFullPage('/it/', Home);
    const body = document.body.textContent;
    expect(body).toContain(HOME_LEAKED_STRINGS_TEXT.it.refundWindowStat);
    expect(body).not.toContain(HOME_LEAKED_STRINGS_TEXT.en.refundWindowStat);
  });
});

describe('Italian text modules this batch touched: complete, faithful, nothing invented', () => {
  const MODULES = {
    LEVEL_QUIZ_TEXT,
    HOME_LEAKED_STRINGS_TEXT,
    COURSE_OPTION_LABELS_TEXT,
    HOME_SEO_TEXT,
    ACADEMY_SEO_TEXT,
    COURSES_SEO_TEXT_hub: COURSES_SEO_TEXT.hub,
    COURSES_SEO_TEXT_quran: COURSES_SEO_TEXT.quran,
    COURSES_SEO_TEXT_arabic: COURSES_SEO_TEXT.arabic,
  };

  function leaves(obj, prefix = '') {
    return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object'
      ? leaves(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, v]]));
  }

  // Values allowed to be identical to English: proper nouns/brand only.
  // (Unlike the French correction, Italian has no untranslated religious
  // quote in any of these five modules -- levelQuiz.js's Ijazah/sanad line
  // is ordinary course-description copy, translated like the rest.)
  const SAME_VALUE_OK = new Set(['Al-Rahma Academy']);

  for (const [name, mod] of Object.entries(MODULES)) {
    it(`${name}: it has the same keys as en, and no value is left in English`, () => {
      expect(mod.it, `${name}.it`).toBeDefined();
      const en2 = Object.fromEntries(leaves(mod.en));
      const itLeaves = Object.fromEntries(leaves(mod.it));
      const extra = Object.keys(itLeaves).filter((k) => !(k in en2));
      const missing = Object.keys(en2).filter((k) => !(k in itLeaves) && en2[k] !== null);
      expect(extra, `${name}: it keys not in en`).toEqual([]);
      expect(missing, `${name}: en keys missing from it`).toEqual([]);
      const untranslated = Object.keys(en2)
        .filter((k) => typeof en2[k] === 'string' && itLeaves[k] === en2[k] && !SAME_VALUE_OK.has(en2[k]));
      expect(untranslated, `${name}: it values identical to en`).toEqual([]);
    });
  }

  it('no figure is added or changed: every number in the Italian text also appears in the English text', () => {
    const numbers = (mod) => new Set(leaves(mod).flatMap(([, v]) => (typeof v === 'string' ? v.match(/\d+/g) || [] : [])));
    for (const [name, mod] of Object.entries(MODULES)) {
      const en2 = numbers(mod.en);
      const added = [...numbers(mod.it)].filter((n) => !en2.has(n));
      expect(added, name).toEqual([]);
    }
  });

  it('Italian glossary: "Tajweed" and "Ijazah" (the site\'s existing Italian spelling), never "tajwid"/"ijaza"', () => {
    for (const [name, mod] of Object.entries(MODULES)) {
      const itLeaves = leaves(mod.it).map(([, v]) => v).filter((v) => typeof v === 'string');
      for (const v of itLeaves) {
        expect(v, `${name}: "tajwid"`).not.toMatch(/\btajwid\b/i);
        expect(v, `${name}: "ijaza"`).not.toMatch(/\bijaza\b/i);
      }
    }
  });
});

describe('Excluded religious content stays exactly as Batch 0 / main left it -- not touched by this batch', () => {
  it('home/isnadChain.js: no it entry exists (still falls back to English, unaffected)', () => {
    expect(ISNAD_CHAIN_TEXT.it).toBeUndefined();
  });

  it('/it/: the IsnadChain section (hadith included) renders the same English text as /en/, untranslated', async () => {
    await mountFullPage('/it/', Home);
    const isnad = document.querySelector('.isnad');
    expect(isnad).toBeTruthy();
    expect(isnad.textContent).toContain(ISNAD_CHAIN_TEXT.en.quote);
    expect(isnad.textContent).toContain(ISNAD_CHAIN_TEXT.en.citation);
    expect(isnad.textContent).toContain(ISNAD_CHAIN_TEXT.en.headingLine1);
  });

  it("it.hero.verseQuote / it.hero.verseRef are still exactly Batch 0's literal English source", () => {
    expect(itLocale.hero.verseQuote).toBe(en.hero.verseQuote);
    expect(itLocale.hero.verseRef).toBe(en.hero.verseRef);
    expect(itLocale.hero.verseQuote).toBe('"Read in the name of your Lord who created."');
    expect(itLocale.hero.verseRef).toBe("Surah Al-'Alaq · 96:1");
  });

  it('/it/: the hero verse card renders the English verse text, not a new Italian translation', async () => {
    await mountFullPage('/it/', Home);
    const verseEl = document.querySelector('.hero__verse');
    expect(verseEl.textContent).toContain(en.hero.verseQuote);
    expect(verseEl.textContent).toContain(en.hero.verseRef);
  });

  it('EN and AR are unaffected by this batch: HOME_SEO_TEXT, COURSES_SEO_TEXT, ACADEMY_SEO_TEXT, LEVEL_QUIZ_TEXT, HOME_LEAKED_STRINGS_TEXT, COURSE_OPTION_LABELS_TEXT keep their pre-existing en/ar values', () => {
    expect(HOME_SEO_TEXT.en.title).toBe('Learn the Quran Online');
    expect(HOME_SEO_TEXT.ar.title).toBe('تعلم القرآن الكريم أونلاين');
    expect(COURSES_SEO_TEXT.hub.en.title).toBe('Courses');
    expect(COURSES_SEO_TEXT.hub.ar.title).toBe('الدورات');
    expect(ACADEMY_SEO_TEXT.en.description).toBe(
      'Learn about Al-Rahma Academy — our mission, teachers, policies, and how to get started with a free trial lesson.',
    );
    expect(ACADEMY_SEO_TEXT.ar.description).toBe(
      'تعرّف على أكاديمية الرحمة — مهمتنا، معلمونا، سياساتنا، وكيفية البدء بحصة تجريبية مجانية.',
    );
    expect(LEVEL_QUIZ_TEXT.en.retakeBtn).toBe('← Retake quiz');
    expect(LEVEL_QUIZ_TEXT.ar.retakeBtn).toBe('→ إعادة الاختبار');
    expect(HOME_LEAKED_STRINGS_TEXT.en.playQuranLabel).toBe('Play Quran');
    expect(HOME_LEAKED_STRINGS_TEXT.ar.playQuranLabel).toBe('تشغيل القرآن');
    expect(COURSE_OPTION_LABELS_TEXT.en['Quran Ijazah']).toBe('Quran Ijazah');
    expect(COURSE_OPTION_LABELS_TEXT.ar['Quran Ijazah']).toBe('إجازة القرآن الكريم');
  });

  it('es/de are still not translated in these five modules (fall back to English) -- unaffected by this batch', async () => {
    const { pickHomeSeo } = await import('../i18n/home/seo');
    for (const lang of ['es', 'de']) {
      expect(pickHomeSeo(lang)).toBe(HOME_SEO_TEXT.en);
      expect(LEVEL_QUIZ_TEXT[lang]).toBeUndefined();
    }
  });
});
