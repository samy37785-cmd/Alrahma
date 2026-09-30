import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import CourseIjazah, { BOOKS } from '../pages/CourseIjazah';
import { IJAZAH_PAGE_IT as IT } from '../i18n/courses/ijazahPageIt';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Ijazah Content Batch: /it/courses/ijazah is a full Italian UI after
// hydration. Religious/scholarly source material (book titles, authors, the
// publisher, Arabic text, the ﷺ mark, the URL and every source term) stays in
// its source form; the four book descriptions/topic lists stay the literal
// English source, exactly like French. EN/AR/FR byte-identity is proven by
// italianIjazahEnArFrRegression.test.jsx.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
useFullPageEnvironment();

async function click(el) {
  fireEvent.click(el);
  await act(async () => {});
}

// Renders the page and collects the text of every state: as loaded, each
// stage opened in turn, and every book card opened.
async function italianTexts() {
  await mountFullPage('/it/courses/ijazah', CourseIjazah);
  const texts = { initial: document.querySelector('#main-content').textContent, stages: [] };
  const headers = [...document.querySelectorAll('.cl__stage-header')];
  for (let i = 0; i < headers.length; i += 1) {
    await click(document.querySelectorAll('.cl__stage-header')[i]);
    texts.stages.push(document.querySelector('.cl__stage.open .cl__stage-body').textContent);
  }
  for (const trigger of document.querySelectorAll('.cl__book-trigger')) await click(trigger);
  texts.books = document.querySelector('.cl__books').textContent;
  texts.main = document.querySelector('#main-content').textContent;
  texts.jsonLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
  texts.meta = {
    lang: document.documentElement.lang,
    title: document.title,
    description: headMeta('meta[name="description"]'),
    h1: document.querySelector('h1').textContent,
    links: [...document.querySelectorAll('a.cl__book-link')].map((a) => a.getAttribute('href')),
  };
  cleanup();
  return texts;
}

describe('/it/courses/ijazah — Italian UI after hydration', () => {
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

  it('every marketing string (hero, stats, lists, stage points, perks) renders in Italian', async () => {
    const r = await italianTexts();
    for (const s of [
      IT.badge, IT.heroSub, IT.enrollTitle,
      ...IT.stats.flatMap((x) => [x.value, x.label]),
      ...IT.learn, ...IT.prereqs, ...IT.audience, ...IT.stageTitles, ...IT.stageDurations,
    ]) {
      expect(r.main, s).toContain(s);
    }
    IT.stagePoints.forEach((points, i) => {
      for (const p of points) expect(r.stages[i], `stage ${i}: ${p}`).toContain(p);
    });
    for (const p of IT.perks) expect(r.main).toContain(p);
  }, 60000);

  it('no English marketing/UI text is left (the English sentences of the page never render)', async () => {
    const r = await italianTexts();
    const english = [
      'Rare Certification', 'Earn a formal Ijazah', 'Average Duration', 'Required Level', 'Private Lessons',
      'Structured Curriculum', 'Complete mastery of all Tajweed rules', 'Foundation Stage', 'Intermediate Stage',
      'Certification Stage', 'Cancel anytime', 'Flexible weekly schedule', 'Monthly progress reports',
      'Fluent Quran reading', 'Commitment to at least 3 lessons', 'Students who completed Hifz',
      'Quran teachers who want', 'Those who want the highest', 'You are now authorised', 'Final evaluation conducted',
      'Revision of Arabic letter forms', 'Comparative study of all seven', 'Provided in class', 'Read Online — Official Site',
      'Quran Ijazah Course',
    ];
    for (const e of english) expect(r.main, e).not.toContain(e);
    for (const s of r.stages) expect(s).not.toMatch(/\b(the|and|with|of)\b/);
  }, 60000);
});

describe('/it/courses/ijazah — source material is preserved, not translated', () => {
  it('book titles, Arabic titles, authors (d. … AH form), publisher and URL are in their source form', async () => {
    const r = await italianTexts();
    for (const b of BOOKS) {
      expect(r.books).toContain(b.title);
      expect(r.books).toContain(b.ar);
    }
    expect(BOOKS.map((b) => b.author.it)).toEqual([
      'Imam Sulayman Al-Jamzouri',
      'Imam Ibn Al-Jazari (d. 833 AH)',
      'Imam Al-Shatibi (d. 590 AH)',
      'King Fahd Glorious Quran Printing Complex',
    ]);
    for (const b of BOOKS) expect(r.books).toContain(b.author.it);
    expect(r.meta.links).toEqual(['https://quran.gov.sa']);
    expect(r.books).not.toMatch(/\bm\. \d|\d+ H\)/);
  }, 60000);

  it('book descriptions and topic lists (with their 61 / 107 / 1,173 counts) are the literal English source', async () => {
    const r = await italianTexts();
    for (const b of BOOKS) {
      expect(b.desc.it, b.title).toBe(b.desc.en);
      expect(b.topics.it, b.title).toEqual(b.topics.en);
      expect(r.books).toContain(b.desc.en);
      for (const t of b.topics.en) expect(r.books).toContain(t);
    }
    expect(BOOKS[0].desc.it).toContain('61 verses');
    expect(BOOKS[1].desc.it).toContain('107 verses');
    expect(BOOKS[2].desc.it).toContain('1,173 verses');
  }, 60000);

  it('the Arabic stage source titles, the ﷺ mark and the source terms survive in Italian', async () => {
    const r = await italianTexts();
    for (const ar of ['تحفة الأطفال', 'متن الجزرية', 'متن الشاطبية', 'مصحف المدينة النبوية']) {
      expect(r.main).toContain(ar);
    }
    expect(r.main).toContain('ﷺ');
    // Stage 4's source line keeps the English-source book name and the Arabic publisher.
    expect(r.stages[3]).toContain("Madinah Mus'haf — مجمع الملك فهد لطباعة المصحف الشريف");
    const all = JSON.stringify(IT);
    for (const term of ['Ijazah', 'Sanad', 'Tajweed', "Qira'at", 'Waqf', "Ibtida'", 'Hafs', 'Warsh', 'Hifz', 'Matn Al-Jazariyyah', 'Al-Shatibiyyah']) {
      expect(all, term).toContain(term);
    }
    // Italian's own spelling, never French's.
    expect(all).not.toMatch(/tajwid|\bijaza\b|\bsanad\b|cheikh/);
    expect(IT.schemaTeaches).toContain('Matn Al-Jazariyyah');
  }, 60000);

  it('the Italian lists mirror the English structure one for one (nothing added or dropped)', () => {
    expect(IT.learn).toHaveLength(10);
    expect(IT.stagePoints.map((p) => p.length)).toEqual([5, 6, 5, 5]);
    expect(IT.prereqs).toHaveLength(4);
    expect(IT.audience).toHaveLength(4);
    expect(IT.perks).toHaveLength(6);
    expect(IT.stats).toHaveLength(4);
    expect(IT.stageTitles).toHaveLength(4);
    expect(IT.stageDurations).toHaveLength(4);
    expect(IT.bookStages).toHaveLength(4);
  });
});

// The page itself was published afterwards, in the Italian Ijazah SEO
// Publication PR; this guard now asserts that and that its siblings stay out.
describe('publication guard: /it/courses/ijazah is published, Islamic Studies is not', () => {
  it('PRERENDER_MANIFEST has the Italian ijazah entry, and none for islamic-studies', () => {
    expect(PRERENDER_MANIFEST.some((e) => e.route === '/courses/ijazah' && e.locale === 'it' && e.status === 'published')).toBe(true);
    for (const route of ['/courses/islamic-studies']) {
      expect(PRERENDER_MANIFEST.some((e) => e.route === route && e.locale === 'it')).toBe(false);
    }
  });

  it('the sitemap on disk lists /it/courses/ijazah once, and not the unpublished Italian Islamic Studies', () => {
    const xml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    expect(xml.match(/<loc>https:\/\/al-rahmaacademy\.com\/it\/courses\/ijazah<\/loc>/g)).toHaveLength(1);
    expect(xml).not.toContain('/it/courses/islamic-studies');
  });
});
