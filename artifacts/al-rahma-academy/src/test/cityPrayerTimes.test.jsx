import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import CityPrayerTimesPage from '../pages/tools/CityPrayerTimesPage';
import PrayerTimesPage from '../pages/tools/PrayerTimesPage';
import { PRAYER_CITIES, prayerCityRoute, prayerCitiesFor, findPrayerCity } from '../data/prayerCities';
import { PRAYER_TABLES, PRAYER_TABLE_YEAR } from '../data/prayerCityTables';
import { PRAYER_CITY_TEXT, needsHighLatitudeNote } from '../i18n/tools/prayerCities';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// City prayer-times pages: /it/tools/prayer-times/<city> for 10 Italian cities
// and /fr/tools/prayer-times/<city> for 10 French cities, each published only
// in its own country's language.

useFullPageEnvironment();

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercel = JSON.parse(readFileSync(path.resolve(appRoot, '../../vercel.json'), 'utf8'));
const appJsx = readFileSync(path.resolve(appRoot, 'src/App.jsx'), 'utf8');

function setNav(name, value) {
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true });
}
afterEach(() => {
  cleanup();
  delete window.navigator.webdriver;
});

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Rough country boxes: enough to catch swapped lat/lng or a sign error.
const BOUNDS = {
  it: { lat: [36, 47.5], lng: [6, 19] },
  fr: { lat: [42, 51.5], lng: [-5, 8.5] },
};
const ZONE = { it: 'Europe/Rome', fr: 'Europe/Paris' };

describe('city data', () => {
  it('10 Italian and 10 French cities, unique lowercase ASCII slugs', () => {
    expect(prayerCitiesFor('it')).toHaveLength(10);
    expect(prayerCitiesFor('fr')).toHaveLength(10);
    expect(PRAYER_CITIES).toHaveLength(20);
    const slugs = PRAYER_CITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(20);
    for (const s of slugs) expect(s).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });

  it('coordinates, time zone, Qibla and distance are plausible for each country', () => {
    for (const c of PRAYER_CITIES) {
      const b = BOUNDS[c.locale];
      expect(c.lat, c.slug).toBeGreaterThan(b.lat[0]);
      expect(c.lat, c.slug).toBeLessThan(b.lat[1]);
      expect(c.lng, c.slug).toBeGreaterThan(b.lng[0]);
      expect(c.lng, c.slug).toBeLessThan(b.lng[1]);
      expect(c.timeZone, c.slug).toBe(ZONE[c.locale]);
      expect(c.qiblaDegrees, c.slug).toBeGreaterThan(105);
      expect(c.qiblaDegrees, c.slug).toBeLessThan(130);
      expect(c.kaabaKm, c.slug).toBeGreaterThan(3000);
      expect(c.kaabaKm, c.slug).toBeLessThan(5000);
    }
  });

  it('every city has 24 rows: the 1st and 15th of each month of the table year', () => {
    const dates = [];
    for (let m = 1; m <= 12; m++) for (const d of ['01', '15']) dates.push(`${PRAYER_TABLE_YEAR}-${String(m).padStart(2, '0')}-${d}`);
    expect(Object.keys(PRAYER_TABLES).sort()).toEqual(PRAYER_CITIES.map((c) => c.slug).sort());
    for (const c of PRAYER_CITIES) {
      const rows = PRAYER_TABLES[c.slug];
      expect(rows.map((r) => r[0]), c.slug).toEqual(dates);
      for (const row of rows) {
        expect(row, `${c.slug} ${row[0]}`).toHaveLength(7);
        for (const t of row.slice(1)) expect(t, `${c.slug} ${row[0]}`).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      }
    }
  });

  it('times are in order every day (Isha may fall after midnight) and Dhuhr is near local noon', () => {
    for (const c of PRAYER_CITIES) {
      for (const [date, fajr, sunrise, dhuhr, asr, maghrib, isha] of PRAYER_TABLES[c.slug]) {
        const label = `${c.slug} ${date}`;
        expect(toMin(fajr), label).toBeLessThan(toMin(sunrise));
        expect(toMin(sunrise), label).toBeLessThan(toMin(dhuhr));
        expect(toMin(dhuhr), label).toBeLessThan(toMin(asr));
        expect(toMin(asr), label).toBeLessThan(toMin(maghrib));
        const ishaMin = toMin(isha) < 12 * 60 ? toMin(isha) + 24 * 60 : toMin(isha);
        expect(ishaMin, label).toBeGreaterThan(toMin(maghrib));
        // Solar noon in Italy/France, standard or summer time: 11:40-14:20.
        expect(toMin(dhuhr), label).toBeGreaterThanOrEqual(11 * 60 + 40);
        expect(toMin(dhuhr), label).toBeLessThanOrEqual(14 * 60 + 20);
      }
    }
  });

  it('the high-latitude note applies only where 18 degrees is never reached (Paris, Lille, Strasbourg)', () => {
    expect(PRAYER_CITIES.filter(needsHighLatitudeNote).map((c) => c.slug).sort()).toEqual(['lille', 'paris', 'strasbourg']);
  });
});

describe('publication', () => {
  it('each city has exactly one published, indexable manifest entry, in its own language', () => {
    for (const c of PRAYER_CITIES) {
      const entries = PRERENDER_MANIFEST.filter((e) => e.route === prayerCityRoute(c.slug));
      expect(entries, c.slug).toEqual([{ route: prayerCityRoute(c.slug), locale: c.locale, status: 'published', indexable: true }]);
    }
  });

  it('App.jsx lists the cities (no :city param), so an unknown city is a real 404', () => {
    expect(appJsx).toContain('PRAYER_CITIES.map((city) => (');
    expect(appJsx).not.toMatch(/path="\/tools\/prayer-times\/:/);
  });

  it('the SPA shell rewrite never matches a city URL: the prerendered file serves it, any other language 404s', () => {
    const rule = vercel.rewrites.find((r) => r.destination === '/spa-shell.html');
    const pattern = rule.source.match(/^\/:path\((.*)\)$/)[1];
    const re = new RegExp(`^/(?:${pattern})/?$`, 'i');
    for (const c of PRAYER_CITIES) {
      for (const prefix of ['', '/ar', '/fr', '/it', '/es', '/de']) {
        expect(re.test(`${prefix}${prayerCityRoute(c.slug)}`), `${prefix}${prayerCityRoute(c.slug)}`).toBe(false);
      }
    }
  });
});

describe('metadata text', () => {
  it('titles are unique; descriptions are 120-160 characters and name the city', () => {
    const titles = new Set();
    for (const c of PRAYER_CITIES) {
      const t = PRAYER_CITY_TEXT[c.locale];
      const title = t.seo.title(c);
      const description = t.seo.description(c, PRAYER_TABLE_YEAR);
      titles.add(title);
      expect(title).toContain(c.name);
      expect(description).toContain(c.name);
      expect([...description].length, `${c.slug}: ${description}`).toBeGreaterThanOrEqual(120);
      expect([...description].length, `${c.slug}: ${description}`).toBeLessThanOrEqual(160);
    }
    expect(titles.size).toBe(20);
  });

  it('Italian and French texts have the same keys', () => {
    const keys = (o) => Object.keys(o).sort();
    expect(keys(PRAYER_CITY_TEXT.it)).toEqual(keys(PRAYER_CITY_TEXT.fr));
    for (const k of Object.keys(PRAYER_CITY_TEXT.it)) {
      if (typeof PRAYER_CITY_TEXT.it[k] === 'object') expect(keys(PRAYER_CITY_TEXT.it[k]), k).toEqual(keys(PRAYER_CITY_TEXT.fr[k]));
    }
  });
});

const mountCity = (urlPath, slug) => mountFullPage(urlPath, () => <CityPrayerTimesPage slug={slug} />);

describe('rendered page (prerender capture: webdriver true)', () => {
  it('/it/tools/prayer-times/roma: Italian head, H1, breadcrumbs, 24-row table, Qibla, method; no today block', async () => {
    setNav('webdriver', true);
    await mountCity('/it/tools/prayer-times/roma', 'roma');
    expect(document.documentElement.lang).toBe('it');
    expect(document.title).toBe('Orari di preghiera a Roma | AL-Rahma Academy');
    expect(headMeta('meta[name="description"]')).toBe(PRAYER_CITY_TEXT.it.seo.description(findPrayerCity('roma'), PRAYER_TABLE_YEAR));
    expect(headMeta('meta[name="robots"]')).not.toMatch(/noindex/);
    expect(document.querySelector('h1').textContent).toBe('Orari di preghiera a Roma');
    expect(document.querySelectorAll('table tbody tr')).toHaveLength(24);
    const first = [...document.querySelectorAll('table tbody tr')[0].children].map((n) => n.textContent);
    expect(first).toEqual(['1 gen', ...PRAYER_TABLES.roma[0].slice(1)]);
    const main = document.querySelector('#main-content').textContent;
    for (const s of ['Strumenti per la preghiera', 'Direzione della Qibla da Roma', '123,3°', '3420 km', 'Lega Musulmana Mondiale', 'Metodo di calcolo', 'Orari di preghiera in altre città', 'Milano']) {
      expect(main, s).toContain(s);
    }
    // Italy never needs the high-latitude rule; no day-specific times are baked in.
    expect(main).not.toContain('solstizio');
    expect(main).not.toContain('Oggi a Roma');
    expect(main).not.toContain('Prayer');
    const crumbs = JSON.parse(document.querySelector('script[data-seo="breadcrumb"]').textContent);
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(['Pagina iniziale', 'Strumenti', 'Strumenti per la preghiera', 'Orari di preghiera', 'Roma']);
    const links = [...document.querySelectorAll('#main-content a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/it/tools/prayer-times');
    expect(links).toContain('/it/tools/prayer-times/milano');
    expect(links).toContain('/it/enroll');
    expect(links).not.toContain('/it/tools/prayer-times/roma');
    expect(links.some((l) => l.includes('/tools/qibla'))).toBe(false);
  });

  it('/fr/tools/prayer-times/paris: French page with the high-latitude note and Isha after midnight', async () => {
    setNav('webdriver', true);
    await mountCity('/fr/tools/prayer-times/paris', 'paris');
    expect(document.documentElement.lang).toBe('fr');
    expect(document.querySelector('h1').textContent).toBe('Horaires de prière à Paris');
    const main = document.querySelector('#main-content').textContent;
    for (const s of ['solstice', 'Ligue islamique mondiale', "Un horaire après minuit", 'Horaires de prière dans d’autres villes', 'Lyon']) {
      expect(main, s).toContain(s);
    }
  });

  it('a city in the wrong language, or English, renders the noindex 404 page', async () => {
    setNav('webdriver', true);
    await mountCity('/fr/tools/prayer-times/roma', 'roma');
    expect(headMeta('meta[name="robots"]')).toMatch(/noindex/);
    expect(document.querySelector('table')).toBeNull();
    cleanup();
    await mountCity('/tools/prayer-times/paris', 'paris');
    expect(headMeta('meta[name="robots"]')).toMatch(/noindex/);
  });
});

describe('real visitor: today block', () => {
  it('asks AlAdhan for today (method 3, school 0) and shows an error line when it fails; the table stays', async () => {
    setNav('webdriver', false);
    await mountCity('/it/tools/prayer-times/milano', 'milano');
    await new Promise((r) => { queueMicrotask(r); });
    const calls = globalThis.fetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('api.aladhan.com'));
    expect(calls.some((u) => u.includes('latitude=45.4642') && u.includes('longitude=9.19') && u.includes('method=3') && u.includes('school=0'))).toBe(true);
    const main = document.querySelector('#main-content').textContent;
    expect(main).toContain('Oggi a Milano');
    expect(document.querySelectorAll('table tbody tr')).toHaveLength(24);
  });
});

describe('/tools/prayer-times lists the cities only in Italian and French', () => {
  it('it: 10 Italian city links; fr: 10 French; en: none', async () => {
    setNav('webdriver', true);
    for (const [url, lang] of [['/it/tools/prayer-times', 'it'], ['/fr/tools/prayer-times', 'fr'], ['/tools/prayer-times', 'en']]) {
      await mountFullPage(url, PrayerTimesPage);
      const hrefs = [...document.querySelectorAll('#main-content a')].map((a) => a.getAttribute('href')).filter((h) => /\/tools\/prayer-times\/[a-z]/.test(h));
      const expected = prayerCitiesFor(lang).map((c) => `/${lang}${prayerCityRoute(c.slug)}`);
      expect(hrefs, lang).toEqual(expected);
      cleanup();
    }
  });
});
