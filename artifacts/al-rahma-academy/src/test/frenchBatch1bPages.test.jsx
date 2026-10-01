import { describe, it, expect } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta, bodyStrings } from './utils/fullPageRender';
import CourseIjazah, { BOOKS as IJAZAH_BOOKS } from '../pages/CourseIjazah';
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

// French Religious-Content Safety Correction: no French translation of a
// hadith, its narrator formula, or a book's title/description/topics is
// created in-project without a licensed source. HADITHS[].fr,
// HADITHS[].narrator.fr, BOOKS[].title (no titleFr is read at all
// anymore) and BOOKS[].desc.fr/topics.fr are now literal copies of their
// English source -- so on the French page they legitimately equal the
// English text the leak-scan below would otherwise flag. Derived
// directly from the data (not hand-copied) so it always matches reality.
//
// French Language & Book-Source Consistency Correction: same reasoning
// for a book's `author` when it names a publisher/organisation (King
// Fahd Glorious Quran Printing Complex) rather than a person -- that is
// source-of-record bibliographic data, not ordinary UI copy, so its
// French field is a literal copy of English too. Filtered to only the
// books where that is actually true, so an accidental future English
// leak in some other book's author.fr still fails this scan.
const RELIGIOUS_SOURCE_TEXT = new Set([
  ...HADITHS.flatMap((h) => [h.fr, h.narrator.fr]),
  ...BOOKS.flatMap((b) => [b.title, b.desc.fr, ...b.topics.fr]),
  ...IJAZAH_BOOKS.flatMap((b) => [b.title, b.desc.fr, ...b.topics.fr]),
  ...[...BOOKS, ...IJAZAH_BOOKS]
    .filter((b) => b.author.fr === b.author.en)
    .map((b) => b.author.fr),
]);

function isAllowed(s) {
  const value = s.replace(/^@[a-z-]+: /, '');
  if (SAME_IN_FRENCH.has(value) || !/[A-Za-z]{2}/.test(value)) return true;
  if (RELIGIOUS_SOURCE_TEXT.has(value)) return true;
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

    // French Religious-Content Safety Correction: this glossary rule is
    // about French PROSE (which must say "tajwid"/"ijaza", never the
    // English transliterations) -- it was never a rule about the hadith
    // and book text this task now deliberately shows in its English
    // source form, which naturally spells them "Tajweed"/"Ijazah".
    it(`${frPath}: French glossary — no "Tajweed" or "Ijazah" outside the English-source religious text`, async () => {
      const strings = [...await allStrings(frPath, Page), document.title,
        ...[...document.head.querySelectorAll('meta[content]')].map((m) => m.getAttribute('content')),
        ...[...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent)];
      // URLs keep their slugs (e.g. /fr/courses/ijazah): slugs are not translated.
      const found = strings.map((s) => s.replace(/https?:\/\/\S+?(?=["\s]|$)/g, ''))
        .filter((s) => !RELIGIOUS_SOURCE_TEXT.has(s.replace(/^@[a-z-]+: /, '')))
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

  // French Religious-Content Safety Correction: the card shows the
  // literal English source line (`hadith.fr` === `hadith.en`), not a
  // French translation of the hadith.
  it('/fr/courses/islamic-studies: the hadith card keeps the Arabic original and shows the literal English line', async () => {
    await mountFullPage('/fr/courses/islamic-studies', CourseIslamicStudies);
    const arabic = document.querySelector('.cl__hadith-arabic').textContent;
    const hadith = HADITHS.find((h) => h.arabic === arabic);
    expect(hadith).toBeDefined();
    expect(document.querySelector('.cl__hadith-text').textContent.trim()).toBe(hadith.en);
    expect(document.querySelector('.cl__hadith-narrator').textContent).toBe(`— ${hadith.narrator.en}`);
    expect(document.querySelector('.cl__hadith-link')?.getAttribute('href')).toBe(hadith.url);
  });

  it('other languages (es) still render the English text (Italian has its own Ijazah and Islamic Studies content since the Italian batches)', async () => {
    await mountFullPage('/es/courses/islamic-studies', CourseIslamicStudies);
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
  // 'King Fahd Glorious Quran Printing Complex' (author of Al-Fiqh
  // Al-Muyassar and Al-Tafsir Al-Muyassar): a publisher/organisation name
  // is source-of-record data, not ordinary UI copy, so it is not
  // francised without a licensed source -- see the French Language &
  // Book-Source Consistency Correction comment on RELIGIOUS_SOURCE_TEXT
  // in frenchBatch1bPages.test.jsx's other describe block.
  const SAME_OK = new Set(['Zoom / Skype / Google Meet', 'King Fahd Glorious Quran Printing Complex']);
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

  // French Religious-Content Safety Correction: HADITHS[].fr (the hadith
  // meaning) and HADITHS[].narrator.fr (its "may Allah be pleased with
  // them" formula) are now intentionally literal copies of the English
  // source -- no French translation of hadith text is created in-project
  // without a licensed source. BOOKS[].desc.fr is the same policy applied
  // to book descriptions.
  const RELIGIOUS_SOURCE_PATHS = /^\.HADITHS\[\d+\](\.narrator)?$|^\.BOOKS\[\d+\]\.desc$/;

  it('French is translated, not copied: only names, sources, and English-source religious text may equal the English', () => {
    const copied = all.filter(({ en, fr, where }) => typeof en === 'string' && fr === en
      && !where.includes('.source') && !SAME_OK.has(en) && !RELIGIOUS_SOURCE_PATHS.test(where));
    expect(copied.map((c) => c.where)).toEqual([]);
  });

  it('no figure is added or changed (French thousands spacing aside)', () => {
    for (const { where, en, fr } of all) {
      const enDigits = new Set(digits(en));
      expect(digits(fr).filter((d) => !enDigits.has(d)), where).toEqual([]);
    }
  });

  // French Religious-Content Safety Correction: `fr` (and `narrator.fr`)
  // must now equal the English source exactly, not a French translation.
  it('all 17 hadiths keep their Arabic text and sunnah.com link, with the literal English line (no French translation)', () => {
    expect(HADITHS).toHaveLength(17);
    for (const h of HADITHS) {
      expect(ARABIC.test(h.arabic)).toBe(true);
      expect(ARABIC.test(h.fr)).toBe(false);
      expect(h.fr).toBe(h.en);
      expect(h.narrator.fr).toBe(h.narrator.en);
      if (h.url !== undefined) expect(h.url).toMatch(/^https:\/\/sunnah\.com\//);
    }
  });

  // French Religious-Content Safety Correction: no book's title,
  // description or topics are translated into French -- `titleFr` is
  // never read (the field itself was removed wherever it existed), and
  // `desc.fr`/`topics.fr` are literal copies of the English source.
  it('all 9 Islamic Studies books and all 4 Ijazah books show their Latin title as-is, with no titleFr and no French desc/topics', () => {
    expect(BOOKS).toHaveLength(9);
    expect(IJAZAH_BOOKS).toHaveLength(4);
    for (const b of [...BOOKS, ...IJAZAH_BOOKS]) {
      expect(b, b.title).not.toHaveProperty('titleFr');
      expect(b.desc.fr, `${b.title}.desc.fr`).toBe(b.desc.en);
      expect(b.topics.fr, `${b.title}.topics.fr`).toEqual(b.topics.en);
    }
  });

  // French Language & Book-Source Consistency Correction: a publisher/
  // organisation name is source-of-record bibliographic data, not ordinary
  // UI copy -- King Fahd Glorious Quran Printing Complex is the author of
  // record for 3 books (Madinah Mus'haf, Al-Fiqh Al-Muyassar,
  // Al-Tafsir Al-Muyassar) and must show the literal English source name in
  // French too, not a francised rendering.
  it("the King Fahd Glorious Quran Printing Complex author credit is the literal English source in French, on all 3 books that cite it", () => {
    const kingFahdBooks = [...BOOKS, ...IJAZAH_BOOKS].filter(
      (b) => b.author.en === 'King Fahd Glorious Quran Printing Complex',
    );
    expect(kingFahdBooks, 'number of books citing the King Fahd Complex as author').toHaveLength(3);
    for (const b of kingFahdBooks) {
      expect(b.author.fr, `${b.title}.author.fr`).toBe(b.author.en);
      expect(b.author.fr, `${b.title}.author.fr`).not.toContain("Complexe du roi Fahd");
    }
  });

  // French Language & Book-Source Consistency Correction: the Hijri-era
  // abbreviation in French author credits ("m. 676 H") is unified to "H",
  // matching src/i18n/hadith/collections.js -- never the English/Latin
  // "AH" (Anno Hegirae).
  it('every book author.fr uses "H" for the Hijri era, never "AH"', () => {
    for (const b of [...BOOKS, ...IJAZAH_BOOKS]) {
      expect(b.author.fr, `${b.title}.author.fr`).not.toMatch(/\bAH\)/);
      if (/\bm\.\s*\d/.test(b.author.fr)) {
        expect(b.author.fr, `${b.title}.author.fr`).toMatch(/\bH\)/);
      }
    }
  });
});
