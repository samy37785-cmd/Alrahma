import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { render, act, cleanup, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import TrustBar from '../components/features/marketing/TrustBar';
import { site } from '../data/site';
import { supportStatusAt, cairoWallClock, msUntilNextCheck, SUPPORT_TIME_ZONE } from '../utils/cairoSupportHours';
import en from '../i18n/en';
import ar from '../i18n/ar';
import fr from '../i18n/fr';
import it_ from '../i18n/it';

// TrustBar WhatsApp deterministic rendering: the support status ("Support online" /
// "Leave a message") used to be computed from the clock wherever the page was rendered,
// including scripts/prerender.mjs's headless Chromium, so the static Home HTML carried the
// status of the moment the site was BUILT. The first render is now a neutral, time-free
// text (the existing footer strings), the static file keeps it, and the live Cairo status
// is computed only after mount in a real visitor's browser.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../dist/public');
const distExists = fs.existsSync(DIST);

const LOCALES = [
  { lang: 'en', url: '/', t: en, raw: 'index.html' },
  { lang: 'ar', url: '/ar/', t: ar, raw: 'ar/index.html' },
  { lang: 'fr', url: '/fr/', t: fr, raw: 'fr/index.html' },
  { lang: 'it', url: '/it/', t: it_, raw: 'it/index.html' },
];
const texts = (t) => ({
  neutral: [t.footer.whatsapp, t.footer.supportHours],
  online: [t.trustBar.supportOnline, t.trustBar.repliesMinutes],
  offline: [t.trustBar.leaveMessage, t.trustBar.repliesHours],
});
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Instants, all given in UTC. Egypt observes daylight saving (UTC+3) from late April to
// late October, UTC+2 otherwise; the expected Cairo wall-clock hour proves which applies.
// 2026-10-04 is a Sunday in DST; 2026-01-11 is a Sunday outside DST.
const DST = { before: '2026-10-04T04:59:00Z', open: '2026-10-04T05:00:00Z', lastMin: '2026-10-04T19:59:00Z', close: '2026-10-04T20:00:00Z' };
const STD = { before: '2026-01-11T05:59:00Z', open: '2026-01-11T06:00:00Z', lastMin: '2026-01-11T20:59:00Z', close: '2026-01-11T21:00:00Z' };
const ONLINE_AT = '2026-10-04T09:00:00Z'; // Sunday 12:00 Cairo
const OFFLINE_AT = '2026-10-04T23:30:00Z'; // Monday 02:30 Cairo

describe('cairoSupportHours: Africa/Cairo by name, never a fixed offset', () => {
  it('uses the named zone', () => {
    expect(SUPPORT_TIME_ZONE).toBe('Africa/Cairo');
    // Code only: the file's comments do mention the two offsets to explain why they are not used.
    const src = fs.readFileSync(path.resolve(__dirname, '../utils/cairoSupportHours.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).toContain("'Africa/Cairo'");
    expect(src).not.toMatch(/UTC\s*[+-]\s*\d|GMT\s*[+-]|getTimezoneOffset|\+0[23]:00/);
  });

  it('reads UTC+3 during daylight saving and UTC+2 outside it', () => {
    expect(cairoWallClock(new Date(DST.open))).toEqual({ weekday: 'Sun', hour: 8 });
    expect(cairoWallClock(new Date('2026-01-11T05:00:00Z'))).toEqual({ weekday: 'Sun', hour: 7 });
    expect(cairoWallClock(new Date(STD.open))).toEqual({ weekday: 'Sun', hour: 8 });
  });

  for (const [name, d] of [['during DST', DST], ['outside DST', STD]]) {
    it(`boundaries ${name}: 07:59 offline, 08:00 online, 22:59 online, 23:00 offline`, () => {
      expect(supportStatusAt(new Date(d.before))).toBe('offline');
      expect(supportStatusAt(new Date(d.open))).toBe('online');
      expect(supportStatusAt(new Date(d.lastMin))).toBe('online');
      expect(supportStatusAt(new Date(d.close))).toBe('offline');
    });
  }

  it('Friday is closed all day; Saturday and Thursday follow the hours', () => {
    expect(supportStatusAt(new Date('2026-10-09T09:00:00Z'))).toBe('offline'); // Fri 12:00
    expect(supportStatusAt(new Date('2026-10-10T09:00:00Z'))).toBe('online'); // Sat 12:00
    expect(supportStatusAt(new Date('2026-10-08T19:59:00Z'))).toBe('online'); // Thu 22:59
    expect(supportStatusAt(new Date('2026-10-08T20:00:00Z'))).toBe('offline'); // Thu 23:00
  });

  it('does not depend on the device time zone', () => {
    const saved = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Europe/Rome']) {
        process.env.TZ = tz;
        expect([ONLINE_AT, OFFLINE_AT, DST.open, STD.before].map((s) => supportStatusAt(new Date(s))), tz)
          .toEqual(['online', 'offline', 'online', 'offline']);
      }
    } finally {
      if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
    }
  });

  it('returns "unknown" (never a false "online") when Intl cannot resolve the zone', () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(() => { throw new RangeError('no tz data'); });
    try {
      expect(supportStatusAt(new Date(ONLINE_AT))).toBe('unknown');
      expect(cairoWallClock(new Date(ONLINE_AT))).toBeNull();
    } finally {
      spy.mockRestore();
    }
    expect(supportStatusAt(new Date(ONLINE_AT))).toBe('online');
  });

  it('schedules the next check just after the next hour boundary', () => {
    expect(msUntilNextCheck(new Date('2026-10-04T19:59:30Z'))).toBe(31000);
    expect(msUntilNextCheck(new Date('2026-10-04T20:00:00Z'))).toBe(3601000);
  });
});

function mount(url) {
  window.history.replaceState({}, '', url);
  const { basename } = langFromPath(url);
  return render(<BrowserRouter basename={basename}><LangProvider><TrustBar /></LangProvider></BrowserRouter>);
}
const link = () => document.querySelector('.trust-bar__wa');
const shown = () => [link().querySelector('strong').textContent, link().querySelector('.trust-bar__wa-sub').textContent];

describe('TrustBar WhatsApp status in the browser (fake clock, Africa/Cairo)', () => {
  let fetchSpy;
  let openSpy;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    fetchSpy = vi.fn(() => Promise.reject(new Error('network disabled in test')));
    vi.stubGlobal('fetch', fetchSpy);
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    openSpy.mockRestore();
    delete window.navigator.webdriver;
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  for (const { lang, url, t } of LOCALES) {
    describe(lang, () => {
      it('the first render, before any effect, is the neutral text and is the same at any time of day', () => {
        const at = (iso) => {
          vi.setSystemTime(new Date(iso));
          window.history.replaceState({}, '', url);
          const { basename } = langFromPath(url);
          return renderToString(<BrowserRouter basename={basename}><LangProvider><TrustBar /></LangProvider></BrowserRouter>);
        };
        const on = at(ONLINE_AT);
        const off = at(OFFLINE_AT);
        expect(on).toBe(off);
        const doc = new JSDOM(on).window.document;
        const a = doc.querySelector('.trust-bar__wa');
        expect([a.querySelector('strong').textContent, a.querySelector('.trust-bar__wa-sub').textContent]).toEqual(texts(t).neutral);
        expect(a.querySelector('.trust-bar__wa-dot--on')).toBeNull();
        for (const s of [...texts(t).online, ...texts(t).offline]) expect(a.textContent).not.toContain(s);
      });

      it('after mount: online inside the hours, offline outside, each with a matching accessible name', async () => {
        for (const [iso, state] of [[ONLINE_AT, 'online'], [OFFLINE_AT, 'offline'], [STD.open, 'online'], [STD.before, 'offline']]) {
          vi.setSystemTime(new Date(iso));
          mount(url);
          await act(async () => {});
          expect(shown(), `${iso}`).toEqual(texts(t)[state]);
          expect(!!link().querySelector('.trust-bar__wa-dot--on')).toBe(state === 'online');
          const name = norm(link().textContent);
          expect(within(link().parentElement).getByRole('link', { name })).toBe(link());
          expect(link().hasAttribute('aria-label')).toBe(false);
          expect(link().getAttribute('title')).toBe(t.trustBar.whatsappStatusAriaLabel);
          expect(link().getAttribute('href')).toBe(`https://wa.me/${site.whatsapp}`);
          expect(link().getAttribute('target')).toBe('_blank');
          expect(link().getAttribute('rel')).toBe('noopener noreferrer');
          cleanup();
        }
      });

      it('crosses 23:00 and 08:00 on its own, with one timer that is removed on unmount', async () => {
        vi.setSystemTime(new Date('2026-10-04T19:59:30Z')); // Sun 22:59:30 Cairo
        const { unmount } = mount(url);
        await act(async () => {});
        expect(shown()).toEqual(texts(t).online);
        expect(vi.getTimerCount()).toBe(1);
        await act(async () => { vi.advanceTimersByTime(29000); });
        expect(shown()).toEqual(texts(t).online); // 22:59:59
        await act(async () => { vi.advanceTimersByTime(2000); });
        expect(shown()).toEqual(texts(t).offline); // 23:00:01
        expect(vi.getTimerCount()).toBe(1);
        // Through the night to Monday 08:00.
        await act(async () => { vi.advanceTimersByTime(9 * 3600 * 1000); });
        expect(shown()).toEqual(texts(t).online);
        expect(vi.getTimerCount()).toBe(1);
        expect(norm(link().textContent)).toBe(norm(texts(t).online.join('')));
        unmount();
        expect(vi.getTimerCount()).toBe(0);
      });

      it('under navigator.webdriver (prerender) it stays neutral and schedules nothing', async () => {
        window.navigator.webdriver = true;
        vi.setSystemTime(new Date(ONLINE_AT));
        mount(url);
        await act(async () => {});
        await act(async () => { vi.advanceTimersByTime(2 * 3600 * 1000); });
        expect(shown()).toEqual(texts(t).neutral);
        expect(vi.getTimerCount()).toBe(0);
        expect(within(link().parentElement).getByRole('link', { name: norm(link().textContent) })).toBe(link());
      });

      it('falls back to the neutral text when the status is unknown', async () => {
        vi.setSystemTime(new Date(ONLINE_AT));
        const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(() => { throw new RangeError('no tz data'); });
        try {
          mount(url);
          await act(async () => {});
          expect(shown()).toEqual(texts(t).neutral);
          expect(link().querySelector('.trust-bar__wa-dot--on')).toBeNull();
        } finally {
          spy.mockRestore();
        }
      });
    });
  }
});

describe.skipIf(!distExists)('raw prerender HTML (dist/public): Home TrustBar carries no build-time status', () => {
  for (const { lang, t, raw } of LOCALES) {
    it(`${lang}: neutral text, dot off, no online/offline wording, link unchanged`, () => {
      const doc = new JSDOM(fs.readFileSync(path.join(DIST, raw), 'utf8')).window.document;
      const links = doc.querySelectorAll('.trust-bar__wa');
      expect(links).toHaveLength(1);
      const a = links[0];
      expect([a.querySelector('strong').textContent, a.querySelector('.trust-bar__wa-sub').textContent]).toEqual(texts(t).neutral);
      expect(a.querySelector('.trust-bar__wa-dot--on')).toBeNull();
      for (const s of [...texts(t).online, ...texts(t).offline]) expect(a.textContent).not.toContain(s);
      expect(a.getAttribute('href')).toBe(`https://wa.me/${site.whatsapp}`);
      expect(a.hasAttribute('aria-label')).toBe(false);
      expect(a.getAttribute('title')).toBe(t.trustBar.whatsappStatusAriaLabel);
    });
  }
});
