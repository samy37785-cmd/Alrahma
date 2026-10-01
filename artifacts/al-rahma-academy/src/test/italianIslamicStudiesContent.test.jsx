import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import CourseIslamicStudies from '../pages/CourseIslamicStudies';
import { HADITHS, MODULES, BOOKS, LEARN, FOR, PERKS } from '../data/islamicStudiesData';
import { ISLAMIC_STUDIES_PAGE_IT as IT } from '../i18n/courses/islamicStudiesPageIt';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Islamic Studies Content Batch: /it/courses/islamic-studies is a
// full Italian UI after hydration. Religious/scholarly source material (the
// 17 hadiths with their narrators and references, book titles, authors,
// publisher, Arabic, the honorific, source links, scholarly terms) stays in
// its source form, and the nine book descriptions and 36 topic lists are the
// literal English source, exactly like French. This batch does NOT publish
// the page (no manifest / sitemap / hreflang change — a separate, later PR).
// EN/AR/FR byte-identity is proven by
// italianIslamicStudiesEnArFrRegression.test.jsx.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
useFullPageEnvironment();

function setWebdriver(value) {
  Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true });
}
afterEach(() => setWebdriver(undefined));

async function click(el) {
  fireEvent.click(el);
  await act(async () => {});
}

// Renders /it/ and collects text for: as loaded, each module opened in turn,
// every book opened.
async function italianTexts() {
  await mountFullPage('/it/courses/islamic-studies', CourseIslamicStudies);
  const r = { initial: document.querySelector('#main-content').textContent, modules: [] };
  const headers = [...document.querySelectorAll('.cl__stage-header')];
  for (let i = 0; i < headers.length; i += 1) {
    await click(document.querySelectorAll('.cl__stage-header')[i]);
    r.modules.push(document.querySelector('.cl__stage.open .cl__stage-body').textContent);
  }
  for (const trigger of document.querySelectorAll('.cl__book-trigger')) await click(trigger);
  r.books = document.querySelector('.cl__books').textContent;
  r.main = document.querySelector('#main-content').textContent;
  r.hadithPlaceholder = document.querySelector('[data-testid="hadith-placeholder"]') !== null;
  r.hadithCard = document.querySelector('.cl__hadith-card')?.textContent ?? '';
  r.hadithArabic = document.querySelector('.cl__hadith-arabic')?.textContent ?? null;
  r.hadithLinkText = document.querySelector('.cl__hadith-link')?.textContent ?? null;
  r.hadithLinkHref = document.querySelector('.cl__hadith-link')?.getAttribute('href') ?? null;
  r.jsonLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
  r.meta = {
    lang: document.documentElement.lang,
    title: document.title,
    description: headMeta('meta[name="description"]'),
    h1: document.querySelector('h1').textContent,
    bookLinks: [...document.querySelectorAll('a.cl__book-link')].map((a) => a.getAttribute('href')),
  };
  cleanup();
  return r;
}

describe('/it/courses/islamic-studies — Italian UI after hydration', () => {
  it('SEO metadata, H1 and JSON-LD text are Italian; inLanguage is unchanged', async () => {
    const r = await italianTexts();
    expect(r.meta.lang).toBe('it');
    expect(r.meta.title).toContain(IT.seoTitle);
    expect(r.meta.description).toBe(IT.seoDescription);
    expect(r.meta.h1).toBe(IT.h1);
    const course = r.jsonLd.flat().find((j) => j['@type'] === 'Course');
    expect(course.name).toBe(IT.schemaName);
    expect(course.description).toBe(IT.seoDescription);
    expect(course.educationalLevel).toBe(IT.schemaLevel);
    expect(course.teaches).toBe(IT.schemaTeaches);
    expect(course.inLanguage).toEqual(['en', 'ar']);
    expect(course.provider.name).toBe('Al-Rahma Academy');
    const crumbs = r.jsonLd.flat().find((j) => j['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.at(-1).name).toBe(IT.breadcrumb);
  }, 60000);

  it('hero, stats, lists, all 5 module titles/durations and all 26 topics render in Italian', async () => {
    const r = await italianTexts();
    for (const s of [
      IT.badge, IT.heroSub, IT.enrollTitle, IT.enrollSub,
      ...IT.stats.flatMap((x) => [x.value, x.label]),
      ...IT.learn, ...IT.audience, ...IT.perks, ...IT.moduleTitles, ...IT.moduleDurations,
    ]) {
      expect(r.main, s).toContain(s);
    }
    IT.moduleTopics.forEach((topics, i) => {
      for (const t of topics) expect(r.modules[i], `module ${i + 1}: ${t}`).toContain(t);
    });
    expect(IT.moduleTopics.flat()).toHaveLength(26);
    expect(IT.moduleTopics.flat()).toContain('Confutazione dei comuni fraintendimenti teologici');
  }, 60000);

  it('no English UI/marketing text is left (hero, stats, lists, perks, module topics, labels)', async () => {
    const r = await italianTexts();
    const english = [
      '5 Complete Modules', 'A comprehensive, source-based', 'Subject Modules', 'Beginner → Advanced', 'Private Lessons',
      '40 Weeks', 'Instruction Languages', 'Core Aqeedah', 'Practical Fiqh', 'Complete Seerah', 'New Muslims who want',
      'Families wanting to educate', 'Western Muslims who want', '1-on-1 with certified scholar', 'Choose your starting module',
      'Cancel anytime', 'Flexible weekly schedule', 'Provided in class', 'Read online —', 'Read all 42 hadiths',
      'Browse this full collection', 'Aqeedah module', 'Primary source', 'Supplementary', 'Refutation of common',
      'Pre-Islamic Arabia — the world', 'Introduction to Tafsir sciences', '8 weeks', '10 weeks', '6 weeks',
      'Read full hadith', 'Loading today',
    ];
    for (const e of english) expect(r.main, e).not.toContain(e);
  }, 60000);

  it('Italian number format is used in UI labels only: "1.900"/"1.322" in link labels, "1,900"/"1,322" untouched in the English descriptions', async () => {
    const r = await italianTexts();
    expect(IT.bookLinkLabels.join(' ')).toContain('1.900 hadith');
    expect(IT.bookLinkLabels.join(' ')).toContain('1.322 hadith');
    expect(IT.bookLinkLabels.join(' ')).not.toMatch(/1,900|1,322/);
    expect(r.books).toContain('Sunnah.com (1.900 hadith)');
    // Source descriptions/topics keep their English numbers.
    expect(BOOKS.map((b) => b.desc.it).join(' ')).toContain('~1,432 hadiths');
    expect(r.books).toContain('nearly 1,900 hadiths');
    expect(r.books).toContain('1,322 hadiths');
  }, 60000);
});

describe('/it/courses/islamic-studies — source material is preserved, not translated', () => {
  it('all 17 hadiths: Italian text, narrator and reference are literal copies of the English source (Arabic untouched)', () => {
    expect(HADITHS).toHaveLength(17);
    for (const h of HADITHS) {
      expect(h.it, h.source.en).toBe(h.en);
      expect(h.narrator.it, h.source.en).toBe(h.narrator.en);
      expect(h.source.it, h.source.en).toBe(h.source.en);
      expect(h.arabic).toBeTruthy();
      expect(h.url).toMatch(/^https:\/\/sunnah\.com\//);
    }
  });

  it('nine books: desc and topics (36) are the literal English; titles, Arabic, authors (d. N AH), publisher and links are source form', async () => {
    expect(BOOKS).toHaveLength(9);
    let topicCount = 0;
    for (const b of BOOKS) {
      expect(b.desc.it, b.title).toBe(b.desc.en);
      expect(b.topics.it, b.title).toEqual(b.topics.en);
      expect(b.author.it, b.title).toBe(b.author.en);
      expect(b.title).not.toBe('');
      topicCount += b.topics.it.length;
    }
    expect(topicCount).toBe(36);
    const authors = BOOKS.map((b) => b.author.it);
    expect(authors).toContain('Imam Ibn Hajar Al-Asqalani (d. 852 AH)');
    expect(authors).toContain('Imam Al-Tirmidhi (d. 279 AH)');
    expect(authors).toContain('Imam Yahya ibn Sharaf Al-Nawawi (d. 676 AH)');
    expect(authors).toContain('Imam Al-Bukhari (d. 256 AH)');
    expect(authors.filter((a) => a === 'King Fahd Glorious Quran Printing Complex')).toHaveLength(2);
    for (const a of authors) expect(a).not.toMatch(/\bm\. \d|\d+ H\)/);
    const r = await italianTexts();
    for (const b of BOOKS) {
      expect(r.books).toContain(b.title);
      expect(r.books).toContain(b.desc.en);
      for (const t of b.topics.en) expect(r.books).toContain(t);
    }
    expect(r.meta.bookLinks).toEqual(
      BOOKS.filter((b) => b.link).map((b) => b.link),
    );
  }, 60000);

  it('module source lines (book + author) and the Arabic source titles stay in source form; the honorific survives', async () => {
    for (const m of MODULES) {
      expect(m.source.it, m.title.en).toBe(m.source.en);
      expect(m.sourceAr).toBeTruthy();
    }
    const r = await italianTexts();
    expect(r.modules[2]).toContain('The Sealed Nectar — Sheikh Safiur-Rahman Mubarakpuri');
    expect(r.modules[1]).toContain('King Fahd Complex');
    for (const ar of MODULES.map((m) => m.sourceAr)) expect(r.main).toContain(ar);
    expect(r.main).toContain('ﷺ');
    // Honorific count per module topic list is identical to the English one.
    MODULES.forEach((m, i) => {
      const count = (xs) => xs.join(' ').split('ﷺ').length - 1;
      expect(count(IT.moduleTopics[i]), m.title.en).toBe(count(m.topics.en));
    });
  }, 60000);

  it('scholarly terms are kept in their source form across the Italian copy; no French/translated variants slip in', () => {
    const all = JSON.stringify(IT);
    for (const term of [
      'Aqeedah', 'Fiqh', 'Seerah', 'Tafsir', 'Hadith', 'Tawhid', 'Taharah', 'Salah', 'Sawm', 'Zakat', 'Hajj', 'Umrah',
      'Wudu', 'Ghusl', 'Tayammum', 'Nisab', 'Qadar', 'Akhlaq', 'Kaffarah', 'Rububiyyah', 'Uluhiyyah', "Asma' wa Sifat",
      'Arkan Al-Iman', 'Mustalah Al-Hadith', "'Ulum Al-Quran", 'Asbab Al-Nuzul', 'Hijrah', 'Dawah', 'Sunnah',
    ]) {
      expect(all, term).toContain(term);
    }
    expect(all).not.toMatch(/\baqida\b|\bsira\b|\btafsir\b|\btawhid\b|\bfiqh\b|cheikh|\bpréisl/);
    expect(IT.moduleTitles[0]).toBe('Aqeedah — il Credo islamico');
  });

  it('the Italian lists mirror the English structure one for one (nothing added or dropped)', () => {
    expect(IT.learn).toHaveLength(LEARN.en.length);
    expect(IT.audience).toHaveLength(FOR.en.length);
    expect(IT.perks).toHaveLength(PERKS.en.length);
    expect(IT.moduleTitles).toHaveLength(MODULES.length);
    expect(IT.moduleDurations).toHaveLength(MODULES.length);
    expect(IT.moduleTopics.map((t) => t.length)).toEqual(MODULES.map((m) => m.topics.en.length));
    expect(IT.bookModules).toHaveLength(BOOKS.length);
    expect(IT.bookLinkLabels).toHaveLength(BOOKS.length);
    expect(LEARN.it).toBe(IT.learn);
    expect(PERKS.it).toBe(IT.perks);
    expect(FOR.it.map((f) => f.label)).toEqual(IT.audience);
    expect(FOR.it.map((f) => f.icon)).toEqual(FOR.en.map((f) => f.icon));
  });
});

describe('Hadith of the Day: Italian placeholder in prerender, no frozen hadith, real hadith only for a real visitor', () => {
  it('prerender capture (navigator.webdriver === true): the Italian placeholder, never a hadith, identical on any date', async () => {
    setWebdriver(true);
    const dates = ['2026-01-02T10:00:00Z', '2026-09-27T10:00:00Z', '2026-12-30T10:00:00Z'];
    const seen = new Set();
    for (const d of dates) {
      vi.setSystemTime(new Date(d));
      const r = await italianTexts();
      expect(r.hadithPlaceholder).toBe(true);
      expect(r.hadithArabic).toBeNull();
      expect(r.hadithCard).toContain("Caricamento dell'hadith del giorno…");
      for (const h of HADITHS) {
        expect(r.hadithCard).not.toContain(h.en);
        expect(r.main).not.toContain(h.arabic);
      }
      seen.add(r.hadithCard);
    }
    expect(seen.size, 'placeholder must not depend on the date').toBe(1);
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
  }, 120000);

  it('real visitor (navigator.webdriver falsy): a real hadith resolves after mount — English source text, Italian link label, sunnah.com href', async () => {
    setWebdriver(undefined);
    const r = await italianTexts();
    expect(r.hadithPlaceholder).toBe(false);
    const hadith = HADITHS.find((h) => h.arabic === r.hadithArabic);
    expect(hadith).toBeDefined();
    expect(r.hadithCard).toContain(hadith.en);
    expect(r.hadithCard).toContain(`— ${hadith.narrator.en}`);
    expect(r.hadithCard).toContain(hadith.source.en);
    expect(r.hadithLinkText).toBe(IT.hadithLink);
    expect(r.hadithLinkHref).toBe(hadith.url);
  }, 60000);

  it('the Italian placeholder/link are UI copy only (no religious text) and the component source still has no render-time Date.now', () => {
    expect(IT.hadithLoading).toBe("Caricamento dell'hadith del giorno…");
    expect(IT.hadithLink).toBe("Leggi l'hadith completo — Sunnah.com ↗");
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/CourseIslamicStudies.jsx'), 'utf8');
    expect(src).not.toMatch(/import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from 'react'/);
    // One Date.now() call, inside the webdriver-gated effect (the rest are comments).
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code.match(/Date\.now\(\)/g) || []).toHaveLength(1);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(navigator\.webdriver\) return;/);
  });
});

describe('scope guard: this batch does not publish /it/courses/islamic-studies', () => {
  it('PRERENDER_MANIFEST has no Italian islamic-studies entry', () => {
    expect(PRERENDER_MANIFEST.some((e) => e.route === '/courses/islamic-studies' && e.locale === 'it')).toBe(false);
  });

  it('the sitemap on disk does not list /it/courses/islamic-studies', () => {
    const xml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    expect(xml).not.toContain('/it/courses/islamic-studies');
  });
});
