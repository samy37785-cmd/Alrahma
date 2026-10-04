import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { pathFor } from '../utils/localePath';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import CommandPalette from '../components/ui/CommandPalette';
import ToolsHub from '../pages/hubs/ToolsHub';
import ResourcesHub from '../pages/hubs/ResourcesHub';
import CoursesQuran from '../pages/hubs/CoursesQuran';
import IslamicTools from '../pages/IslamicTools';
import VerseOfTheDayPage from '../pages/tools/VerseOfTheDayPage';
import PrayerTimesPage from '../pages/tools/PrayerTimesPage';
import { IT_HIDDEN_ROUTES, isRouteHidden, quranReaderRoute } from '../utils/italianLinkPolicy';
import { IT_TAJWEED_ROUTE } from '../i18n/itDiscoverability';
import { PRERENDER_MANIFEST, canonicalUrlFor } from '../../scripts/prerender-routes.mjs';

// Italian internal-link policy: the published Tajweed Checker is reachable from
// the Italian UI, and no visible Italian link leads to a route whose Italian page
// is not published (those URLs are SPA shells with canonical "/").

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin: vi.fn(), adminMfaSetup: vi.fn(), adminMfaConfirm: vi.fn(),
  adminMfaVerify: vi.fn(), adminLogout: vi.fn(), adminRefresh: vi.fn(),
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../dist/public');
const distExists = fs.existsSync(DIST);
useFullPageEnvironment();

const hrefs = () => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
const hasHref = (h) => hrefs().includes(h);

describe('link policy', () => {
  it('lists exactly the four Italian routes with no published Italian page', () => {
    expect([...IT_HIDDEN_ROUTES].sort()).toEqual(['/login', '/resources/blog', '/tools/islamic-calendar', '/tools/qibla']);
    const publishedIt = new Set(PRERENDER_MANIFEST.filter((e) => e.locale === 'it' && e.status === 'published').map((e) => e.route));
    for (const route of IT_HIDDEN_ROUTES) {
      // When a page is published it must leave the hidden list (and be linked again).
      expect(publishedIt.has(route), `${route} is published in Italian but still hidden`).toBe(false);
    }
    expect(publishedIt.has('/tools/tajweed-checker')).toBe(true);
  });

  it('only hides for Italian', () => {
    for (const lang of ['en', 'ar', 'fr', 'es', 'de']) {
      for (const route of IT_HIDDEN_ROUTES) expect(isRouteHidden(lang, route)).toBe(false);
      expect(quranReaderRoute(lang)).toBe('/tools/quran');
    }
    expect(quranReaderRoute('it')).toBe('/tools/quran-reader');
  });
});

describe('Italian pages: Tajweed Checker is reachable, unpublished routes are not linked', () => {
  const HIDDEN_HREFS = ['/it/tools/qibla', '/it/tools/islamic-calendar', '/it/resources/blog', '/it/login', '/it/tools/quran'];

  it('/it/tools lists the Tajweed Checker as a full card, after the existing six', async () => {
    await mountFullPage('/it/tools', ToolsHub);
    const cards = [...document.querySelectorAll('a.hub-card')];
    expect(cards).toHaveLength(7);
    expect(cards[6].getAttribute('href')).toBe('/it/tools/tajweed-checker');
    expect(cards[6].querySelector('.hub-card__title').textContent).toBe('Verificatore di Tajweed con IA');
    expect(cards[6].querySelector('.hub-card__link').textContent).toMatch(/→/);
    expect(cards.slice(0, 6).map((c) => c.getAttribute('href'))).toEqual([
      '/it/tools/quran-reader', '/it/tools/adhkar', '/it/tools/hadith', '/it/tools/prayer', '/it/tools/tasbeeh', '/it/tools/arabic-alphabet',
    ]);
  });

  it.each([
    ['/it/tools', ToolsHub],
    ['/it/resources', ResourcesHub],
    ['/it/courses/quran', CoursesQuran],
    ['/it/tools/prayer', IslamicTools],
    ['/it/tools/verse-of-the-day', VerseOfTheDayPage],
    ['/it/tools/prayer-times', PrayerTimesPage],
  ])('%s links to no unpublished Italian route (header, footer, page body)', async (url, Page) => {
    await mountFullPage(url, Page);
    for (const h of HIDDEN_HREFS) expect(hasHref(h), `${url} still links ${h}`).toBe(false);
    expect(hasHref('/it/resources/faq')).toBe(true);
  });

  it('the header login stays usable for Italian visitors (a button that navigates, not a crawlable link)', async () => {
    await mountFullPage('/it/tools', ToolsHub);
    expect(screen.getAllByRole('button', { name: 'Accedi' }).length).toBeGreaterThan(0);
  });

  it('/it/resources keeps FAQ, About and Teachers but not the Blog card', async () => {
    await mountFullPage('/it/resources', ResourcesHub);
    expect(document.querySelectorAll('a.hub-card')).toHaveLength(3);
    for (const h of ['/it/resources/faq', '/it/academy/about', '/it/academy/teachers']) {
      expect(document.querySelector(`a.hub-card[href="${h}"]`)).not.toBeNull();
    }
  });

  it('/it/courses/quran opens the published Quran reader', async () => {
    await mountFullPage('/it/courses/quran', CoursesQuran);
    expect(document.querySelector('.hub-related a.btn')?.getAttribute('href')).toBe('/it/tools/quran-reader');
  });

  it('/it/tools/prayer lists only the published tools', async () => {
    await mountFullPage('/it/tools/prayer', IslamicTools);
    expect([...document.querySelectorAll('a.hub-card')].map((c) => c.getAttribute('href'))).toEqual([
      '/it/tools/prayer-times', '/it/tools/verse-of-the-day',
    ]);
  });

  it('Verse of the Day links onward to the Tajweed Checker', async () => {
    await mountFullPage('/it/tools/verse-of-the-day', VerseOfTheDayPage);
    expect(hasHref(`/it${IT_TAJWEED_ROUTE}`)).toBe(true);
  });
});

describe('English, Arabic and French are unchanged', () => {
  it.each([
    ['/tools', '', ToolsHub],
    ['/ar/tools', '/ar', ToolsHub],
    ['/fr/tools', '/fr', ToolsHub],
  ])('%s: 6 cards, no Tajweed card, header/footer still link Blog, Qibla and Calendar', async (url, prefix, Page) => {
    await mountFullPage(url, Page);
    expect(document.querySelectorAll('a.hub-card')).toHaveLength(6);
    expect(hasHref(`${prefix}/tools/tajweed-checker`)).toBe(false);
    for (const h of ['/tools/qibla', '/tools/islamic-calendar', '/resources/blog', '/login']) {
      expect(hasHref(`${prefix}${h}`), `${url} lost ${h}`).toBe(true);
    }
  });

  it('English /courses/quran keeps its /tools/quran link', async () => {
    await mountFullPage('/courses/quran', CoursesQuran);
    expect(document.querySelector('.hub-related a.btn')?.getAttribute('href')).toBe('/tools/quran');
  });
});

describe('command palette', () => {
  function openPalette(lang) {
    window.history.pushState({}, '', pathFor('/', lang));
    return render(
      <LangProvider>
        <AdminAuthProvider>
          <MemoryRouter>
            <CommandPalette onClose={() => {}} />
          </MemoryRouter>
        </AdminAuthProvider>
      </LangProvider>,
    );
  }
  const search = (q) => fireEvent.change(screen.getByRole('textbox'), { target: { value: q } });
  const subs = () => [...document.querySelectorAll('.ds-cmd__item-sub')].map((e) => e.textContent);

  it.each(['tajweed', 'tajwid', 'تجويد', 'verifica tajweed', 'Tajweed'])('Italian: "%s" finds the Tajweed Checker', (q) => {
    openPalette('it');
    search(q);
    expect(subs()).toContain('/tools/tajweed-checker');
  });

  it.each(['faq', 'domande', 'domande frequenti', 'FAQ'])('Italian: "%s" finds the FAQ', (q) => {
    openPalette('it');
    search(q);
    expect(subs()).toContain('/resources/faq');
  });

  it('Italian: offers no unpublished page', () => {
    openPalette('it');
    for (const r of ['/tools/qibla', '/tools/islamic-calendar', '/resources/blog']) expect(subs()).not.toContain(r);
    expect(subs()).toContain('/tools/tajweed-checker');
  });

  it.each(['en', 'ar', 'fr'])('%s: palette is unchanged (no Tajweed Checker, Blog/Qibla/Calendar present)', (lang) => {
    openPalette(lang);
    expect(subs()).not.toContain('/tools/tajweed-checker');
    for (const r of ['/tools/qibla', '/tools/islamic-calendar', '/resources/blog']) expect(subs()).toContain(r);
  });
});

// Real prerendered output: crawl every published Italian page.
describe.skipIf(!distExists)('Italian internal link crawl (dist/public)', () => {
  const ORIGIN = 'https://al-rahmaacademy.com';
  const itPages = PRERENDER_MANIFEST.filter((e) => e.locale === 'it' && e.status === 'published');
  const publishedPaths = new Set(PRERENDER_MANIFEST.filter((e) => e.status === 'published').map((e) => new URL(canonicalUrlFor(e)).pathname.replace(/\/$/, '') || '/'));
  const fileFor = (e) => path.join(DIST, new URL(canonicalUrlFor(e)).pathname, 'index.html');
  const norm = (h) => {
    try { const u = new URL(h, `${ORIGIN}/`); if (u.hostname.replace(/^www\./, '') !== 'al-rahmaacademy.com') return null; return u.pathname.replace(/\/$/, '') || '/'; } catch { return null; }
  };
  const inbound = new Map();
  const broken = [];

  beforeAll(() => {
    for (const e of itPages) {
      const html = fs.readFileSync(fileFor(e), 'utf8');
      const self = new URL(canonicalUrlFor(e)).pathname.replace(/\/$/, '');
      const body = html.slice(html.indexOf('<body'));
      for (const m of body.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
        const target = norm(m[1].replace(/&amp;/g, '&'));
        if (!target || !target.startsWith('/it')) continue;
        if (!publishedPaths.has(target)) broken.push(`${self} -> ${target}`);
        else if (target !== self) inbound.set(target, (inbound.get(target) || new Set()).add(self));
      }
    }
  });

  it('no Italian page links to a route that is not a published page', () => {
    expect(broken).toEqual([]);
  });

  it('no Italian page is an orphan', () => {
    const orphans = itPages.map((e) => new URL(canonicalUrlFor(e)).pathname.replace(/\/$/, '')).filter((p) => p !== '/it' && !(inbound.get(p)?.size));
    expect(orphans).toEqual([]);
  });

  it('the Tajweed Checker is linked from the tools hub and from Verse of the Day', () => {
    const from = inbound.get('/it/tools/tajweed-checker') || new Set();
    expect(from.has('/it/tools')).toBe(true);
    expect(from.has('/it/tools/verse-of-the-day')).toBe(true);
  });

  it('the FAQ stays linked from header, footer and the resources hub', () => {
    const from = inbound.get('/it/resources/faq') || new Set();
    expect(from.size).toBeGreaterThanOrEqual(30);
    expect(from.has('/it/resources')).toBe(true);
  });
});
