import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Routes, Route } from 'react-router-dom';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import CoursesQuran from '../pages/hubs/CoursesQuran';
import ResourcesHub from '../pages/hubs/ResourcesHub';
import TermsOfService from '../pages/TermsOfService';
import RefundPolicy from '../pages/RefundPolicy';
import CourseIjazah from '../pages/CourseIjazah';
import CourseIslamicStudies from '../pages/CourseIslamicStudies';
import TeacherProfile from '../pages/TeacherProfile';
import HadithLibrary from '../pages/HadithLibrary';
import { IT_PAGE_META_DESCRIPTIONS, IT_TEACHER_META_DESCRIPTIONS } from '../i18n/itMetaDescriptions';
import { TEACHERS } from '../data';
import BASE from './fixtures/it-meta-remaining-baseline.json';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian metadata, remaining wave: sixteen pages whose description was outside 120-160 code points.
// Only the <head> description (and its og:/twitter: copies) changes. Title, H1 and every other language
// are checked against the Production raw HTML captured before this change (fixtures/it-meta-remaining-baseline.json).

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin: vi.fn(), adminMfaSetup: vi.fn(), adminMfaConfirm: vi.fn(),
  adminMfaVerify: vi.fn(), adminLogout: vi.fn(), adminRefresh: vi.fn(),
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../dist/public');
const distExists = fs.existsSync(DIST);
useFullPageEnvironment();

const len = (s) => [...s].length;
const TeacherRoute = () => <Routes><Route path="/academy/teachers/:id" element={<TeacherProfile />} /></Routes>;
const FIXED_TEACHERS = [1, 2, 3, 4, 5, 6, 7, 8, 10];

const PAGES = {
  '/courses/quran': [CoursesQuran, IT_PAGE_META_DESCRIPTIONS.coursesQuran],
  '/resources': [ResourcesHub, IT_PAGE_META_DESCRIPTIONS.resources],
  '/academy/terms': [TermsOfService, IT_PAGE_META_DESCRIPTIONS.terms],
  '/academy/refund-policy': [RefundPolicy, IT_PAGE_META_DESCRIPTIONS.refund],
  '/courses/ijazah': [CourseIjazah, IT_PAGE_META_DESCRIPTIONS.ijazah],
  '/courses/islamic-studies': [CourseIslamicStudies, IT_PAGE_META_DESCRIPTIONS.islamicStudies],
  '/tools/hadith': [HadithLibrary, IT_PAGE_META_DESCRIPTIONS.hadith],
  ...Object.fromEntries(FIXED_TEACHERS.map((id) => [`/academy/teachers/${id}`, [TeacherRoute, IT_TEACHER_META_DESCRIPTIONS[id]]])),
};
const ROUTES = Object.keys(PAGES);
// Other languages are compared only where the page is published (e.g. /tools/hadith exists only in fr and it).
const OTHERS = ['/en', '/ar', '/fr'].flatMap((p) => ROUTES.map((r) => [p, r])).filter(([p, r]) => PRERENDER_MANIFEST.some((e) => e.status === 'published' && e.route === r && e.locale === p.slice(1)));

describe('the sixteen Italian descriptions', () => {
  it('cover exactly the pages that were outside 120-160 (teachers 9 and 11 already fit)', () => {
    expect(ROUTES).toHaveLength(16);
    expect(Object.keys(IT_TEACHER_META_DESCRIPTIONS).map(Number).sort((a, b) => a - b)).toEqual(FIXED_TEACHERS);
    for (const id of [9, 11]) expect(IT_TEACHER_META_DESCRIPTIONS[id]).toBeUndefined();
  });

  it.each(ROUTES)('%s: 125-155 code points, was outside 120-160, differs from the old text', (route) => {
    const next = PAGES[route][1];
    const old = BASE[`/it${route}`].desc;
    expect(len(old) < 120 || len(old) > 160).toBe(true);
    expect(next).not.toBe(old);
    expect(len(next)).toBeGreaterThanOrEqual(125);
    expect(len(next)).toBeLessThanOrEqual(155);
  });

  it('are all different from each other (no duplicates)', () => {
    const all = [...Object.values(IT_PAGE_META_DESCRIPTIONS), ...Object.values(IT_TEACHER_META_DESCRIPTIONS)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('every teacher description names the teacher and follows the profile (name, title, gender)', () => {
    for (const id of FIXED_TEACHERS) {
      const t = TEACHERS.find((x) => x.id === id);
      const d = IT_TEACHER_META_DESCRIPTIONS[id];
      expect(d.startsWith(`${t.nameEn}, `)).toBe(true);
      expect(d).toContain(t.title.it.charAt(0).toLowerCase() + t.title.it.slice(1));
      expect(d).toContain(t.gender === 'f' ? 'laureata' : 'laureato');
      expect(t.bio.it).toContain(t.gender === 'f' ? 'Laureata' : 'Laureato');
    }
  });

  it('the resources text no longer mentions the unpublished blog', () => {
    expect(IT_PAGE_META_DESCRIPTIONS.resources).not.toMatch(/blog/i);
  });
});

describe('mounted pages (hydration)', () => {
  it.each(ROUTES)('/it%s: description, og and twitter copies are the new text; title and H1 unchanged', async (route) => {
    const [Page, next] = PAGES[route];
    await mountFullPage(`/it${route}`, Page);
    expect(headMeta('meta[name="description"]')).toBe(next);
    expect(headMeta('meta[property="og:description"]')).toBe(next);
    expect(headMeta('meta[name="twitter:description"]')).toBe(next);
    expect(document.title).toBe(BASE[`/it${route}`].title);
    expect(document.querySelector('h1').textContent.trim()).toBe(BASE[`/it${route}`].h1);
  });

  it.each(OTHERS)('%s%s: description and title are unchanged', async (prefix, route) => {
    const [Page] = PAGES[route];
    await mountFullPage(`${prefix === '/en' ? '' : prefix}${route}`, Page);
    expect(headMeta('meta[name="description"]')).toBe(BASE[`${prefix}${route}`].desc);
    expect(document.title).toBe(BASE[`${prefix}${route}`].title);
  });
});

describe.skipIf(!distExists)('prerendered output (dist/public)', () => {
  const read = (p) => fs.readFileSync(path.join(DIST, p, 'index.html'), 'utf8');
  const first = (html, re) => (html.match(re) || [])[1];
  const un = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');

  it.each(ROUTES)('it%s: raw HTML carries the new description once; title and H1 unchanged', (route) => {
    const html = read(`it${route}`);
    const next = PAGES[route][1];
    expect(un(first(html, /<meta name="description" content="([^"]*)"/))).toBe(next);
    expect(un(first(html, /<meta property="og:description" content="([^"]*)"/))).toBe(next);
    expect(un(first(html, /<meta name="twitter:description" content="([^"]*)"/))).toBe(next);
    expect((html.match(/<meta name="description"/g) || []).length).toBe(1);
    expect(un(first(html, /<title>([^<]*)<\/title>/))).toBe(BASE[`/it${route}`].title);
    expect(un(first(html, /<h1[^>]*>([^<]*)<\/h1>/)).trim()).toBe(BASE[`/it${route}`].h1);
  });

  it.each(OTHERS)('%s%s: raw description is unchanged', (lp, route) => {
    const prefix = lp === '/en' ? '' : lp.slice(1);
    const html = read(`${prefix}${route}`.replace(/^\//, ''));
    expect(un(first(html, /<meta name="description" content="([^"]*)"/))).toBe(BASE[`${lp}${route}`].desc);
  });
});
