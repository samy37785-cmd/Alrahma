import { describe, it, expect } from 'vitest';
import {
  PRERENDER_MANIFEST,
  hreflangLinksFor,
  ogLocaleFor,
} from '../../scripts/prerender-routes.mjs';
import { RESOURCES_SEO_TEXT, pickResourcesSeo } from '../i18n/resources/content';
import { PAGE_HEADING_TEXT, pickPageHeading } from '../i18n/about/pageHeading';
import { FOUNDER_STORY_TEXT } from '../i18n/about/founderStory';
import { TASBEEH_TEXT } from '../i18n/tools/tasbeeh';
import { OG_LOCALE_MAP } from '../utils/localePath';
import { siteFacts } from '../data/siteFacts';

// Italian SEO wave: the 28 eligible public pages, plus the three Italian
// copy gaps that had to be closed first. Literal expectations on purpose —
// this suite must be able to catch a bug in the manifest helpers, not
// merely agree with them.
const IT_ROUTES = [
  '/', '/courses', '/courses/quran', '/courses/arabic', '/courses/ijazah', '/courses/islamic-studies',
  '/academy', '/academy/about', '/academy/teachers',
  ...Array.from({ length: 11 }, (_, i) => `/academy/teachers/${i + 1}`),
  '/academy/privacy', '/academy/terms', '/academy/refund-policy',
  '/resources', '/resources/faq',
  '/tools', '/tools/prayer', '/tools/tasbeeh', '/tools/arabic-alphabet', '/tools/adhkar',
  '/tools/tajweed-checker',
];

describe('Italian copy gaps (resources / about / tasbeeh)', () => {
  it('/resources has the approved Italian meta description', () => {
    expect(RESOURCES_SEO_TEXT.it.description).toBe(
      "Scopri le risorse di Al-Rahma Academy: articoli del blog, FAQ, informazioni sull'accademia e profili degli insegnanti.",
    );
    expect(pickResourcesSeo('it')).toBe(RESOURCES_SEO_TEXT.it);
  });

  it('/academy/about has the approved Italian H1', () => {
    expect(PAGE_HEADING_TEXT.it.h1).toBe('Chi siamo su Al-Rahma Academy');
    expect(pickPageHeading('it')).toBe(PAGE_HEADING_TEXT.it);
  });

  it('founder story it mirrors the English structure: same keys, same dynamic fragments, same brand and signature source', () => {
    const { en, it: itText } = FOUNDER_STORY_TEXT;
    expect(Object.keys(itText).sort()).toEqual(Object.keys(en).sort());
    // Numbers stay live siteFacts interpolation — never frozen into the copy.
    for (const k of ['body1', 'body2Pre', 'body2Strong', 'body3Pre', 'body3Mid', 'body3Post', 'body4']) {
      expect(itText[k], k).toBeTruthy();
      expect(itText[k], `${k} must not hardcode a number`).not.toMatch(/\d/);
    }
    expect(itText.sigBrand).toBe('Al-Rahma Academy');
    expect(itText.sigLine).toBe(`${siteFacts.founder}, fondatore`);
    expect(itText.body1).toContain('egiziano');
    expect(itText.body3Post).toContain('ijaza');
  });

  it('/tools/tasbeeh has Italian shell text and keeps the dhikr phrases exactly as they are', () => {
    const t = TASBEEH_TEXT.it;
    expect(t.seo.title).toBeTruthy();
    expect(t.breadcrumbs.tools).toBe('Strumenti');
    expect(t.hero.title).toBeTruthy();
    for (const phrase of ['SubhanAllah', 'Alhamdulillah', 'AllahuAkbar']) {
      expect(t.seo.description).toContain(phrase);
      expect(t.hero.sub).toContain(phrase);
    }
  });

  it('EN / AR / FR entries are untouched', () => {
    expect(RESOURCES_SEO_TEXT.en.description).toBe(
      'Explore resources from Al-Rahma Academy: blog articles, FAQ, academy information, and teacher profiles.',
    );
    expect(PAGE_HEADING_TEXT.en.h1).toBe('About Al-Rahma Academy');
    expect(PAGE_HEADING_TEXT.ar.h1).toBe('من نحن');
    expect(PAGE_HEADING_TEXT.fr.h1).toBe("À propos d'Al-Rahma Academy");
    expect(FOUNDER_STORY_TEXT.ar.sigLine).toBe('محمود سامي، المؤسس');
    expect(FOUNDER_STORY_TEXT.fr.sigLine).toBe(`${siteFacts.founder}, fondateur`);
    expect(TASBEEH_TEXT.en.hero.title).toBe('Digital Tasbeeh Counter');
    expect(TASBEEH_TEXT.ar.hero.title).toBe('المسبحة الرقمية');
    expect(TASBEEH_TEXT.fr.hero.title).toBe('Compteur de tasbih numérique');
  });
});

describe('Italian PRERENDER_MANIFEST entries', () => {
  const itEntries = PRERENDER_MANIFEST.filter((e) => e.locale === 'it');

  it('is exactly the 31 earlier Italian routes plus hadith, prayer-times, enroll, verse-of-the-day and quran-reader, all published and indexable', () => {
    expect(itEntries.map((e) => e.route).sort()).toEqual([...IT_ROUTES, '/tools/hadith', '/tools/prayer-times', '/enroll', '/tools/verse-of-the-day', '/tools/quran-reader'].sort());
    expect(itEntries).toHaveLength(36);
    for (const e of itEntries) {
      expect(e.status).toBe('published');
      expect(e.indexable).toBe(true);
    }
  });

  it('excludes Blog and every other unpublished tool', () => {
    const routes = itEntries.map((e) => e.route);
    for (const bad of [
      '/resources/blog',
      '/tools/qibla',
      '/tools/islamic-calendar', '/tools/hifz-review',
    ]) {
      expect(routes).not.toContain(bad);
    }
  });

  it('adds no es/de entry, and leaves no duplicate (route, locale) pairs', () => {
    expect(PRERENDER_MANIFEST.some((e) => e.locale === 'es' || e.locale === 'de')).toBe(false);
    const keys = PRERENDER_MANIFEST.map((e) => `${e.route}@${e.locale}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Italian hreflang and og:locale', () => {
  it('og locale map maps it to it_IT (central map and prerender map agree)', () => {
    expect(OG_LOCALE_MAP.it).toBe('it_IT');
    const home = PRERENDER_MANIFEST.find((e) => e.route === '/' && e.locale === 'it');
    expect(ogLocaleFor(home).primary).toBe('it_IT');
    expect([...ogLocaleFor(home).alternates].sort()).toEqual(['ar_EG', 'en_GB', 'fr_FR']);
  });

  it('a route with Italian lists it in hreflang, reciprocally', () => {
    for (const locale of ['en', 'ar', 'fr', 'it']) {
      const links = hreflangLinksFor({ route: '/resources', locale });
      expect(links.map((l) => l.hreflang)).toEqual(['en', 'ar', 'fr', 'it', 'x-default']);
      expect(links.find((l) => l.hreflang === 'it').href).toBe('https://al-rahmaacademy.com/it/resources');
    }
  });

  it('/courses/ijazah lists the Italian alternate, reciprocally in every locale', () => {
    for (const locale of ['en', 'ar', 'fr', 'it']) {
      const links = hreflangLinksFor({ route: '/courses/ijazah', locale });
      expect(links.map((l) => l.hreflang)).toEqual(['en', 'ar', 'fr', 'it', 'x-default']);
      expect(links.find((l) => l.hreflang === 'it').href).toBe('https://al-rahmaacademy.com/it/courses/ijazah');
      expect(ogLocaleFor({ route: '/courses/ijazah', locale }).alternates.concat(ogLocaleFor({ route: '/courses/ijazah', locale }).primary)).toContain('it_IT');
    }
  });

  it('/tools/tajweed-checker lists the Italian alternate, reciprocally in every locale', () => {
    for (const locale of ['en', 'ar', 'fr', 'it']) {
      const links = hreflangLinksFor({ route: '/tools/tajweed-checker', locale });
      // Order follows the manifest; the set is what matters.
      expect(links.map((l) => l.hreflang).sort()).toEqual(['ar', 'en', 'fr', 'it', 'x-default']);
      expect(links.find((l) => l.hreflang === 'it').href).toBe('https://al-rahmaacademy.com/it/tools/tajweed-checker');
    }
  });

  it('/courses/islamic-studies lists the Italian alternate, reciprocally in every locale', () => {
    for (const locale of ['en', 'ar', 'fr', 'it']) {
      const links = hreflangLinksFor({ route: '/courses/islamic-studies', locale });
      expect(links.map((l) => l.hreflang).sort()).toEqual(['ar', 'en', 'fr', 'it', 'x-default']);
      expect(links.find((l) => l.hreflang === 'it').href).toBe('https://al-rahmaacademy.com/it/courses/islamic-studies');
    }
  });

  it('routes with no Italian page advertise no Italian alternate', () => {
    for (const route of ['/resources/blog', '/tools/qibla']) {
      const links = hreflangLinksFor({ route, locale: 'en' });
      expect(links.some((l) => l.hreflang === 'it'), route).toBe(false);
      expect(ogLocaleFor({ route, locale: 'en' }).alternates, route).not.toContain('it_IT');
    }
  });
});
