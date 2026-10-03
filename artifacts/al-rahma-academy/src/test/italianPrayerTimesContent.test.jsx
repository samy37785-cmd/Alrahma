import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import PrayerTimesPage from '../pages/tools/PrayerTimesPage';
import { PRAYER_TIMES_TEXT } from '../i18n/tools/prayerTimes';
import { RELATED_TOOLS_TEXT } from '../i18n/tools/relatedTools';
import { TOOLS_TEXT } from '../i18n/content';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Content Wave (Prayer Times): /it/tools/prayer-times shows Italian
// shell text. Arabic prayer names, Hijri month names, Eid, Qibla and the
// calculation-method names stay in source form. No manifest/sitemap change.

useFullPageEnvironment();

function setNav(name, value) {
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true });
}
afterEach(() => {
  cleanup();
  delete window.navigator.webdriver;
  delete window.navigator.geolocation;
});

const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

// SHA-256 of the en/ar/fr entries on origin/main before this change.
const BASELINE = {
  Pen: '5fc4978568548972bb370a9f25d4a61ced2a0dbe113cc1ad84ca8a2301b13bf1',
  Ren: '1a9be0ab0ed93cf564c08d6984f6a0120e73c45b298f940b91c74f36dd157f4b',
  Ten: '0c713d1383da6881a6d0fb1ee4faed8234d2c232608932346e96520caebb5d03',
  Par: '51cd3f3a2bb8c5c7e0bd5ac3405cf4b0ec527b963d8dc42287487fb453fca8da',
  Rar: '9533a4d76ccb7b86551dfe3f557339475ba1c663b749329707d0a1502ae6eada',
  Tar: 'ed5b46aacfa250c47110cb46892afa89f8a8c785c3ebf7256159c65815a61f33',
  Pfr: '9e4620ada60e38356aa418499fd3e4b82d790d25b5d8963dd37a436b896b5d7b',
  Rfr: '2c869c6bac5964972b4babc44a77b32e9a1985709c16ad7aa54c549cb981d8e9',
  Tfr: 'f6eb9346405031cafa463da10f32b3728b0d017fa4d67d08b47ecd0418e90998',
};

describe('EN/AR/FR text is unchanged', () => {
  it('PRAYER_TIMES_TEXT, RELATED_TOOLS_TEXT and TOOLS_TEXT en/ar/fr hash to their baseline', () => {
    for (const l of ['en', 'ar', 'fr']) {
      expect(sha(PRAYER_TIMES_TEXT[l]), `P${l}`).toBe(BASELINE[`P${l}`]);
      expect(sha(RELATED_TOOLS_TEXT[l]), `R${l}`).toBe(BASELINE[`R${l}`]);
      expect(sha(TOOLS_TEXT[l]), `T${l}`).toBe(BASELINE[`T${l}`]);
    }
  });
});

describe('/it/tools/prayer-times: Italian shell, source terms kept', () => {
  it('the Italian entries mirror the English structure', () => {
    const keys = (o) => Object.keys(o).sort();
    expect(keys(PRAYER_TIMES_TEXT.it)).toEqual(keys(PRAYER_TIMES_TEXT.en));
    expect(keys(PRAYER_TIMES_TEXT.it.seo)).toEqual(keys(PRAYER_TIMES_TEXT.en.seo));
    expect(keys(PRAYER_TIMES_TEXT.it.breadcrumbs)).toEqual(keys(PRAYER_TIMES_TEXT.en.breadcrumbs));
    expect(keys(RELATED_TOOLS_TEXT.it)).toEqual(keys(RELATED_TOOLS_TEXT.en));
  });

  it('prerender capture (webdriver true): Italian title, description, H1, breadcrumbs, controls and related tools; no English leaks', async () => {
    setNav('webdriver', true);
    await mountFullPage('/it/tools/prayer-times', PrayerTimesPage);
    expect(document.documentElement.lang).toBe('it');
    expect(document.title).toBe('Orari di preghiera | AL-Rahma Academy');
    expect(headMeta('meta[name="description"]')).toBe(PRAYER_TIMES_TEXT.it.seo.description);
    expect(document.querySelector('h1').textContent).toBe('Orari di preghiera');
    const text = document.querySelector('#main-content').textContent;
    for (const s of ['Strumenti', 'Strumenti per la preghiera', 'Metodo di calcolo', 'Formato ora', 'Prova anche:', 'Direzione della Qibla', 'Calendario islamico', 'Versetto del giorno']) {
      expect(text, s).toContain(s);
    }
    for (const s of ['Prayer Times', 'Prayer Tools', 'Also try', 'Qibla Direction', 'Islamic Calendar', 'Verse of the Day', 'Accurate times', 'Calculation method']) {
      expect(text, s).not.toContain(s);
    }
    // Source terms stay as they are.
    for (const s of ['Egyptian Authority', 'Umm Al-Qura, Makkah', 'Muslim World League', 'ISNA', 'Karachi']) {
      expect(text, s).toContain(s);
    }
    expect(document.querySelector('[aria-label="Strumenti correlati"]')).not.toBeNull();
    // The alert toggle only renders once times exist, so check its copy directly.
    expect(PRAYER_TIMES_TEXT.it.notifyToggleAria).toBe('Attiva o disattiva gli avvisi di preghiera');
  });

  it('prerender capture: geolocation is never called, and no coordinates, city or prayer times are rendered', async () => {
    setNav('webdriver', true);
    const getCurrentPosition = vi.fn();
    setNav('geolocation', { getCurrentPosition });
    await mountFullPage('/it/tools/prayer-times', PrayerTimesPage);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(document.querySelector('.it__prayer-list')).toBeNull();
    const text = document.querySelector('#main-content').textContent;
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
    expect(text).not.toMatch(/-?\d{1,3}\.\d{3,}/);
  });

  it('a real visitor still triggers the geolocation request (behaviour unchanged)', async () => {
    setNav('webdriver', false);
    const getCurrentPosition = vi.fn();
    setNav('geolocation', { getCurrentPosition });
    await mountFullPage('/it/tools/prayer-times', PrayerTimesPage);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

describe('publication state: published in wave 3 (see italianNextWavePublication.test.jsx)', () => {
  it('/tools/prayer-times has its Italian manifest entry (wave 3)', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/tools/prayer-times' && e.locale === 'it')).toHaveLength(1);
  });
});
