import { describe, it, expect } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta, bodyStrings } from './utils/fullPageRender';
import CourseIjazah from '../pages/CourseIjazah';
import CourseIslamicStudies from '../pages/CourseIslamicStudies';
import { IJAZAH_PAGE_FR, ISLAMIC_STUDIES_PAGE_FR } from '../i18n/courses/religiousPagesFr';
import { HADITHS, MODULES, BOOKS, LEARN, FOR, PERKS } from '../data/islamicStudiesData';

// French Localization Batch 1B: /fr/courses/ijazah and
// /fr/courses/islamic-studies render French metadata, H1, JSON-LD text and
// visible/accessible text in every state (all stages, modules and books
// opened), translated from the English source only, with the tajwid/ijaza
// glossary. EN/AR stay byte-identical: see frenchBatch1bEnArRegression.

useFullPageEnvironment();

const PAGES = [
  { path: '/courses/ijazah', Page: CourseIjazah, text: IJAZAH_PAGE_FR, course: 'ijazah' },
  { path: '/courses/islamic-studies', Page: CourseIslamicStudies, text: ISLAMIC_STUDIES_PAGE_FR, course: 'islamic-studies' },
];

async function click(el) {
  fireEvent.click(el);
  await act(async () => {});
}

// Every visible/accessible string of the page, with every stage/module and
// every book card opened.
async function allStrings(urlPath, Page) {
  await mountFullPage(urlPath, Page);
  const set = new Set(bodyStrings());
  const count = document.querySelectorAll('.cl__stage-header').length;
  for (let i = 0; i < count; i += 1) {
    await click(document.querySelectorAll('.cl__stage-header')[i]);
    bodyStrings().forEach((s) => set.add(s));
  }
  for (const trigger of document.querySelectorAll('.cl__book-trigger')) await click(trigger);
  bodyStrings().forEach((s) => set.add(s));
  return set;
}

function courseJsonLd() {
  return [...document.head.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => JSON.parse(s.textContent))
    .find((d) => d['@type'] === 'Course');
}

// Identical in English and French by nature: names of people and books,
// riwaya names, brands, the site's shared header/footer, and a word that is
// spelled the same in French.
const ARABIC = /[؀-ۿ]/;
const SAME_IN_FRENCH = new Set([
  'AL-RAHMA', 'ACADEMY', 'AL-Rahma', 'Academy.', 'Copyright ©', 'Adhkar', 'FAQ', 'Blog', 'Contact', 'Ctrl K',
  'alrahmaacademy038@gmail.com', 'Facebook', 'Instagram', 'YouTube', 'TikTok', 'Snapchat',
  'EN', 'AR', 'IT', 'ES', 'DE', 'FR', 'Zoom / Skype / Google Meet', 'Certification',
  'Tuhfat Al-Atfal', 'Matn Al-Jazariyyah', 'Matn Al-Shatibiyyah', 'Imam Sulayman Al-Jamzouri',
  "Hafs 'an 'Asim", "Warsh 'an Nafi'",
  'Al-Fiqh Al-Muyassar', 'Bulugh Al-Maram', "Ash-Shama'il Al-Muhammadiyah", "Al-Arba'een Al-Nawawiyyah",
  'Riyad As-Salihin', 'Al-Adab Al-Mufrad', 'Al-Tafsir Al-Muyassar',
  "Al-Arba'een Al-Nawawiyyah — Imam Al-Nawawi", "Al-Mu'jam Al-Awsat — Al-Tabarani",
]);

function isAllowed(s) {
  const value = s.replace(/^@[a-z-]+: /, '');
  if (SAME_IN_FRENCH.has(value) || !/[A-Za-z]{2}/.test(value)) return true;
  // Hadith source label: book name + hadith number.
  if (/^Hadith \d+ — Al-Arba'een Al-Nawawiyyah$/.test(value)) return true;
  // Stage source line: the book's name followed by its author's Arabic name.
  return ARABIC.test(value) && /^[A-Za-z' -]+ — [؀-ۿ\s()]+$/.test(value);
}

describe('French Batch 1B pages', () => {
  for (const { path, Page, text, course } of PAGES) {
    const frPath = `/fr${path}`;

    it(`${frPath}: lang=fr, dir=ltr, French title/description/OG/H1, self canonical`, async () => {
      await mountFullPage(frPath, Page);
      expect(document.documentElement.lang).toBe('fr');
      expect(document.documentElement.dir).toBe('ltr');
      expect(document.title).toBe(`${text.seoTitle} | AL-Rahma Academy`);
      expect(headMeta('meta[name="description"]')).toBe(text.seoDescription);
      expect(headMeta('meta[property="og:title"]')).toBe(`${text.seoTitle} | AL-Rahma Academy`);
      expect(headMeta('meta[property="og:description"]')).toBe(text.seoDescription);
      expect(headMeta('meta[name="twitter:description"]')).toBe(text.seoDescription);
      expect([...document.querySelectorAll('h1')].map((h) => h.textContent.trim())).toEqual([text.h1]);
      expect(document.querySelector('main').getAttribute('dir')).toBe('ltr');
      expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href'))
        .toBe(`https://al-rahmaacademy.com${frPath}`);
    });

    it(`${frPath}: Course JSON-LD text is French; inLanguage and provider unchanged`, async () => {
      await mountFullPage(path, Page);
      const en = courseJsonLd();
      cleanup();
      await mountFullPage(frPath, Page);
      const fr = courseJsonLd();
      expect(fr.name).toBe(text.schemaName);
      expect(fr.description).toBe(text.seoDescription);
      expect(fr.educationalLevel).toBe(text.schemaLevel);
      expect(fr.teaches).toBe(text.schemaTeaches);
      expect(fr.inLanguage).toEqual(['en', 'ar']);
      expect(fr.inLanguage).toEqual(en.inLanguage);
      expect(fr.provider).toEqual(en.provider);
      expect(fr.hasCourseInstance).toEqual(en.hasCourseInstance);
      expect(Object.keys(fr)).toEqual(Object.keys(en));
    });

    it(`${frPath}: no text or accessibility label is left in English, in any open/closed state`, async () => {
      const en = await allStrings(path, Page);
      cleanup();
      const fr = await allStrings(frPath, Page);
      const leaks = [...fr].filter((s) => en.has(s) && !isAllowed(s));
      expect(leaks).toEqual([]);
    });

    it(`${frPath}: French glossary — no "Tajweed" or "Ijazah" in text, metadata or JSON-LD text`, async () => {
      const strings = [...await allStrings(frPath, Page), document.title,
        ...[...document.head.querySelectorAll('meta[content]')].map((m) => m.getAttribute('content')),
        ...[...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent)];
      // URLs keep their slugs (e.g. /fr/courses/ijazah): slugs are not translated.
      const found = strings.map((s) => s.replace(/https?:\/\/\S+?(?=["\s]|$)/g, ''))
        .filter((s) => /tajweed|ijazah/i.test(s));
      expect(found).toEqual([]);
    });

    it(`${frPath}: CTAs keep the same enroll payload and links as English`, async () => {
      await mountFullPage(frPath, Page);
      await click(document.querySelector('.cl__hero-actions .btn--gold'));
      expect(`${window.location.pathname}${window.location.search}`).toBe(`/fr/enroll?course=${course}`);
      cleanup();
      await mountFullPage(frPath, Page);
      await click(document.querySelector('.cl__enroll-card .btn--gold'));
      expect(`${window.location.pathname}${window.location.search}`).toBe(`/fr/enroll?course=${course}`);
      expect(document.querySelector('.cl__enroll-link').getAttribute('href')).toBe('/fr/academy/teachers');
    });
  }

  it('/fr/courses/islamic-studies: the hadith card keeps the Arabic original and shows the French line', async () => {
    await mountFullPage('/fr/courses/islamic-studies', CourseIslamicStudies);
    const arabic = document.querySelector('.cl__hadith-arabic').textContent;
    const hadith = HADITHS.find((h) => h.arabic === arabic);
    expect(hadith).toBeDefined();
    expect(document.querySelector('.cl__hadith-text').textContent.trim()).toBe(hadith.fr);
    expect(document.querySelector('.cl__hadith-narrator').textContent).toBe(`— ${hadith.narrator.fr}`);
    expect(document.querySelector('.cl__hadith-link').getAttribute('href')).toBe(hadith.url);
  });

  it('other languages (it) still render the English text', async () => {
    await mountFullPage('/it/courses/ijazah', CourseIjazah);
    expect(document.querySelector('h1').textContent).toBe('Quran Ijazah Course');
    cleanup();
    await mountFullPage('/it/courses/islamic-studies', CourseIslamicStudies);
    expect(document.querySelector('h1').textContent).toBe('Islamic Studies');
  });
});

describe('Islamic Studies data: French for every English value, nothing invented', () => {
  // Walk en/fr pairs anywhere in the data.
  function pairs(node, where = '', out = []) {
    if (Array.isArray(node)) node.forEach((n, i) => pairs(n, `${where}[${i}]`, out));
    else if (node && typeof node === 'object') {
      if ('en' in node) out.push({ where, en: node.en, fr: node.fr });
      for (const [k, v] of Object.entries(node)) if (!['en', 'ar', 'fr'].includes(k)) pairs(v, `${where}.${k}`, out);
    }
    return out;
  }
  const all = pairs({ HADITHS, MODULES, BOOKS, LEARN, FOR, PERKS });
  // Hadith `en` is the English meaning line; its French must exist too.
  const SAME_OK = new Set(['Zoom / Skype / Google Meet']);
  const digits = (v) => (Array.isArray(v) ? v.join(' ') : String(v)).replace(/(\d)[ ,](\d{3})/g, '$1$2').match(/\d+/g) || [];

  it('has a French value, of the same shape, for every English value', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const { where, en, fr } of all) {
      expect(fr, where).toBeDefined();
      expect(Array.isArray(fr), where).toBe(Array.isArray(en));
      if (Array.isArray(en)) expect(fr.length, where).toBe(en.length);
    }
    for (const list of [LEARN, FOR]) expect(list.fr.length).toBe(list.en.length);
  });

  it('French is translated, not copied: only names and sources may equal the English', () => {
    const copied = all.filter(({ en, fr, where }) => typeof en === 'string' && fr === en
      && !where.includes('.source') && !SAME_OK.has(en));
    expect(copied.map((c) => c.where)).toEqual([]);
  });

  it('no figure is added or changed (French thousands spacing aside)', () => {
    for (const { where, en, fr } of all) {
      const enDigits = new Set(digits(en));
      expect(digits(fr).filter((d) => !enDigits.has(d)), where).toEqual([]);
    }
  });

  it('all 17 hadiths keep their Arabic text and sunnah.com link, with a French line from the English', () => {
    expect(HADITHS).toHaveLength(17);
    for (const h of HADITHS) {
      expect(ARABIC.test(h.arabic)).toBe(true);
      expect(ARABIC.test(h.fr)).toBe(false);
      expect(h.fr).not.toBe(h.en);
      expect(h.url).toMatch(/^https:\/\/sunnah\.com\//);
    }
  });
});
