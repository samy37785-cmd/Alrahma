import { describe, it, expect, afterEach, vi } from 'vitest';

// Same stub rationale as tajweedCheckerPrerenderSafety.test.jsx: jsdom has no
// Web Speech API, TajweedCheckerPage reads it at MODULE load, and the real
// Chromium scripts/prerender.mjs drives does expose it. The fake counts
// constructions so this suite can prove the page never even creates a
// recogniser (let alone starts the mic) without a user click.
const speech = vi.hoisted(() => {
  const state = { constructed: 0, started: 0 };
  class FakeSpeechRecognition {
    constructor() { state.constructed += 1; }
    start() { state.started += 1; }
    stop() {}
  }
  window.SpeechRecognition = FakeSpeechRecognition;
  return state;
});

import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import TajweedCheckerPage from '../pages/tools/TajweedCheckerPage';
import { TAJWEED_CHECKER_TEXT } from '../i18n/tools/tajweedChecker';
import { PRERENDER_MANIFEST, hreflangLinksFor } from '../../scripts/prerender-routes.mjs';

// Italian Tajweed Checker Content + SEO Publication.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../dist/public');
const distExists = existsSync(distDir);
const ORIGIN = 'https://al-rahmaacademy.com';

const IT = TAJWEED_CHECKER_TEXT.it;
const BISMILLAH = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const FATIHA_ARABIC = [
  'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
  'الرَّحْمَٰنِ الرَّحِيمِ',
  'مَالِكِ يَوْمِ الدِّينِ',
  'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
  'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
];

function renderAt(route) {
  window.history.replaceState({}, '', route);
  const { basename } = langFromPath(route);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <TajweedCheckerPage />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('/it/tools/tajweed-checker — Italian UI', () => {
  afterEach(() => { cleanup(); document.title = ''; });

  it('every shell string is Italian: SEO, breadcrumb, eyebrow, H1, subtitle and the start button', () => {
    const { container } = renderAt('/it/tools/tajweed-checker');
    expect(document.documentElement.lang).toBe('it');
    expect(document.title).toContain(IT.seo.title);
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe(IT.seo.description);
    const text = container.textContent;
    expect(container.querySelector('h1').textContent).toBe('Verificatore di Tajweed');
    for (const s of [IT.breadcrumbs.tools, IT.breadcrumbs.current, IT.eyebrow, IT.hero.sub, IT.startReciting]) {
      expect(text, s).toContain(s);
    }
    const english = ['AI-Powered', 'Start Reciting', 'Read the verse aloud', 'Tools', 'Tajweed Checker'];
    for (const e of english) expect(text, e).not.toContain(e);
  });

  it('Quran text is untouched: the Arabic verses, transliteration and reference are byte-identical to every other language', () => {
    const grab = (route) => {
      const { container } = renderAt(route);
      const tabs = [...container.querySelectorAll('.tajweed__verse-tab')];
      const out = [];
      tabs.forEach((tab, i) => {
        tab.click();
        out.push(i);
      });
      const first = {
        arabic: container.querySelector('.tajweed__arabic').textContent,
        translit: container.querySelector('.tajweed__transliteration').textContent,
        ref: container.querySelector('.tajweed__ref').textContent,
      };
      cleanup();
      return { first, tabs: tabs.length };
    };
    const it_ = grab('/it/tools/tajweed-checker');
    const en = grab('/tools/tajweed-checker');
    const ar = grab('/ar/tools/tajweed-checker');
    const fr = grab('/fr/tools/tajweed-checker');
    expect(it_.tabs).toBe(6);
    expect(it_.first.arabic).toBe(en.first.arabic);
    expect(it_.first.translit).toBe(en.first.translit);
    expect(it_.first.ref).toBe(en.first.ref);
    for (const other of [ar, fr]) expect(other.first.arabic).toBe(it_.first.arabic);
    // The shipped Arabic itself, literally (no re-typed or "fixed" Quran text).
    expect(en.first.arabic).toBe(BISMILLAH);
  });

  it('no new Italian translation of Quran text: the English gloss stays the English source (as in French), and Arabic-only pages still hide it', () => {
    const it_ = renderAt('/it/tools/tajweed-checker').container.querySelector('.tajweed__translation').textContent;
    cleanup();
    const en = renderAt('/tools/tajweed-checker').container.querySelector('.tajweed__translation').textContent;
    cleanup();
    const fr = renderAt('/fr/tools/tajweed-checker').container.querySelector('.tajweed__translation').textContent;
    cleanup();
    expect(it_).toBe('In the name of Allah, the Most Gracious, the Most Merciful');
    expect(it_).toBe(en);
    expect(it_).toBe(fr);
    expect(renderAt('/ar/tools/tajweed-checker').container.querySelector('.tajweed__translation')).toBeNull();
  });

  it('Arabic verses in the page source are exactly the six Al-Fatiha verses', () => {
    const src = readFileSync(path.resolve(__dirname, '../pages/tools/TajweedCheckerPage.jsx'), 'utf8');
    for (const v of FATIHA_ARABIC) expect(src).toContain(`arabic: '${v}'`);
    expect(src.match(/arabic: '/g)).toHaveLength(6);
  });

  it('Tajweed terminology uses the site\'s Italian spelling and keeps the {error} token', () => {
    const all = JSON.stringify(IT);
    expect(all).toContain('Tajweed');
    expect(all).not.toMatch(/tajwid/i);
    expect(IT.errors.recognitionError).toContain('{error}');
    expect(IT.errors.recognitionError.replace('{error}', 'network')).toBe('Errore di riconoscimento vocale: network');
  });

  it('EN / AR / FR text is unchanged', () => {
    expect(TAJWEED_CHECKER_TEXT.en.hero.title).toBe('Tajweed Checker');
    expect(TAJWEED_CHECKER_TEXT.en.startReciting).toBe('Start Reciting');
    expect(TAJWEED_CHECKER_TEXT.ar.hero.title).toBe('مدقق التجويد');
    expect(TAJWEED_CHECKER_TEXT.ar.startReciting).toBe('ابدأ التلاوة');
    expect(TAJWEED_CHECKER_TEXT.fr.hero.title).toBe('Vérificateur de tajwid');
    expect(TAJWEED_CHECKER_TEXT.fr.startReciting).toBe('Commencer la récitation');
    expect(Object.keys(TAJWEED_CHECKER_TEXT)).toEqual(['en', 'ar', 'fr', 'it']);
  });
});

describe('Italian Tajweed Checker prerender safety (no mic, no analysis, no user data, no hydration drift)', () => {
  afterEach(() => { cleanup(); document.title = ''; });

  it('rendering /it/ never constructs or starts a recogniser and never asks for the microphone', () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    speech.constructed = 0;
    speech.started = 0;
    const { container } = renderAt('/it/tools/tajweed-checker');
    expect(speech.constructed, 'SpeechRecognition must not be constructed without a click').toBe(0);
    expect(speech.started).toBe(0);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(container.querySelector('.tajweed__result')).toBeNull();
    expect(container.querySelector('.tajweed__hint')).toBeNull();
    expect(container.querySelector('.tajweed__error')).toBeNull();
    expect(container.querySelector('.tajweed__score-ring')).toBeNull();
    const btn = container.querySelector('.tajweed__controls button');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain(IT.startReciting);
  });

  it('initial markup is deterministic: two independent renders are identical (nothing time/user/device-derived)', () => {
    const a = renderAt('/it/tools/tajweed-checker').container.innerHTML;
    cleanup();
    const b = renderAt('/it/tools/tajweed-checker').container.innerHTML;
    expect(a).toBe(b);
    expect(a).not.toMatch(/tajweed__(result|hint|error|score|heard)/);
  });

  it('the page source has no useEffect and no auto-start; the mic starts only from the Start button onClick', () => {
    const src = readFileSync(path.resolve(__dirname, '../pages/tools/TajweedCheckerPage.jsx'), 'utf8');
    expect(src).not.toMatch(/\buseEffect\b/);
    expect(src).not.toMatch(/getUserMedia/);
    expect(src).toMatch(/onClick=\{startListening\}/);
    expect(src.match(/rec\.start\(\)/g)).toHaveLength(1);
  });
});

describe.skipIf(!distExists)('Italian Tajweed Checker prerender (dist/public) — raw HTML before any JavaScript', () => {
  const load = (rel) => new JSDOM(readFileSync(path.join(distDir, rel), 'utf8')).window.document;

  it('it/tools/tajweed-checker/index.html: lang, canonical, og:locale, Italian title/description/H1', () => {
    const rel = 'it/tools/tajweed-checker/index.html';
    expect(existsSync(path.join(distDir, rel))).toBe(true);
    const doc = load(rel);
    expect(doc.documentElement.lang).toBe('it');
    expect(doc.documentElement.dir).toBe('ltr');
    expect(doc.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(`${ORIGIN}/it/tools/tajweed-checker`);
    expect(doc.querySelector('meta[property="og:locale"]').getAttribute('content')).toBe('it_IT');
    expect(
      [...doc.querySelectorAll('meta[property="og:locale:alternate"]')].map((m) => m.getAttribute('content')).sort(),
    ).toEqual(['ar_EG', 'en_GB', 'fr_FR']);
    expect(doc.title).toBe('Verificatore di Tajweed con IA | AL-Rahma Academy');
    expect(doc.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      "Strumento didattico per esercitarti col Tajweed: recita un versetto ad alta voce, vedi cosa ha riconosciuto il browser e ricevi un feedback.",
    );
    expect(doc.querySelector('h1').textContent.trim()).toBe('Verificatore di Tajweed');
    const crumbs = JSON.parse(doc.querySelector('script[data-seo="breadcrumb"]').textContent);
    expect(crumbs.itemListElement.map((i) => ({ name: i.name, item: i.item }))).toEqual([
      { name: 'Pagina iniziale', item: `${ORIGIN}/it/` },
      { name: 'Strumenti', item: `${ORIGIN}/it/tools` },
      { name: 'Verificatore di Tajweed', item: `${ORIGIN}/it/tools/tajweed-checker` },
    ]);
  });

  it('raw HTML has no analysis result, transcript, listening state, mic status or device permission text', () => {
    const doc = load('it/tools/tajweed-checker/index.html');
    const main = doc.querySelector('#main-content');
    for (const sel of ['.tajweed__result', '.tajweed__hint', '.tajweed__error', '.tajweed__score-ring', '.tajweed__heard']) {
      expect(main.querySelector(sel), sel).toBeNull();
    }
    expect(main.textContent).not.toContain(IT.whatIHeard);
    expect(main.textContent).not.toContain(IT.listeningHint);
    expect(main.textContent).not.toContain('%');
    const btn = main.querySelector('.tajweed__controls button');
    expect(btn.textContent).toContain(IT.startReciting);
    expect(btn.hasAttribute('disabled')).toBe(false);
    // The Arabic reference verse is present and unchanged.
    expect(main.querySelector('.tajweed__arabic').textContent).toBe(BISMILLAH);
  });

  it.each([
    ['it/tools/tajweed-checker/index.html'],
    ['tools/tajweed-checker/index.html'],
    ['ar/tools/tajweed-checker/index.html'],
    ['fr/tools/tajweed-checker/index.html'],
  ])('%s: exactly five hreflang alternates (en, ar, fr, it, x-default)', (rel) => {
    const doc = load(rel);
    const links = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')];
    expect(links).toHaveLength(5);
    expect(Object.fromEntries(links.map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]))).toEqual({
      en: `${ORIGIN}/tools/tajweed-checker`,
      ar: `${ORIGIN}/ar/tools/tajweed-checker`,
      fr: `${ORIGIN}/fr/tools/tajweed-checker`,
      it: `${ORIGIN}/it/tools/tajweed-checker`,
      'x-default': `${ORIGIN}/tools/tajweed-checker`,
    });
  });
});

describe('Italian publication scope', () => {
  it('Tajweed Checker joins the Italian manifest exactly once, with the five-hreflang set', () => {
    const it_ = PRERENDER_MANIFEST.filter((e) => e.locale === 'it');
    expect(it_.filter((e) => e.route === '/tools/tajweed-checker')).toHaveLength(1);
    expect(hreflangLinksFor({ route: '/tools/tajweed-checker', locale: 'en' }).map((l) => l.hreflang).sort()).toEqual(['ar', 'en', 'fr', 'it', 'x-default']);
  });

  it('the sitemap on disk lists /it/tools/tajweed-checker once', () => {
    const xml = readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    expect(xml.match(/<loc>https:\/\/al-rahmaacademy\.com\/it\/tools\/tajweed-checker<\/loc>/g)).toHaveLength(1);
  });
});
