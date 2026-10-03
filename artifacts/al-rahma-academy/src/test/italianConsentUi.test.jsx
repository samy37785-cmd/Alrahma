import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Analytics from '../components/ui/Analytics';
import ConsentBanner from '../components/ui/ConsentBanner';
import CookieSettingsButton from '../components/ui/CookieSettingsButton';
import { CONSENT_COPY, pickConsentCopy } from '../analytics/consentCopy';
import { ANALYTICS_PRIVACY_COPY } from '../pages/Privacy';
import { CONSENT_STORAGE_KEY, __resetConsentForTests } from '../analytics/consent';
import { __resetGaForTests } from '../analytics/ga';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Consent UI Localization: the cookie banner, its buttons and the
// "Cookie settings" link are Italian on /it/, and the Italian privacy page
// quotes those button names verbatim. Only copy changes: no handler, state,
// storage key, consent mode or GA loading is touched. GA is never contacted:
// the script tag is only inspected, and jsdom does not load it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ID = 'G-TEST12345';
const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const shaFile = (rel) =>
  createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const IT = CONSENT_COPY.it;

vi.mock('../components/layout/Header', () => ({ default: () => null }));
vi.mock('../components/layout/Footer', () => ({ default: () => null }));

function mount(urlPath, children = null) {
  window.history.replaceState({}, '', urlPath);
  const { basename } = langFromPath(urlPath);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <Analytics />
        <ConsentBanner />
        {children}
      </LangProvider>
    </BrowserRouter>,
  );
}
const gaScripts = () => document.querySelectorAll('script[src*="googletagmanager.com"]');
function reset() {
  cleanup();
  window.localStorage.clear();
  __resetConsentForTests();
  __resetGaForTests();
  document.querySelectorAll('script').forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
  delete window[`ga-disable-${TEST_ID}`];
}

beforeEach(() => {
  reset();
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
});
afterEach(() => {
  reset();
  vi.unstubAllEnvs();
});

describe('EN/AR/FR and the consent logic are unchanged (baselines from origin/main)', () => {
  it('CONSENT_COPY en/ar/fr hash to their baseline', () => {
    expect(sha(CONSENT_COPY.en)).toBe('01bcd3b2722301b6705a60468187dc2de616acaa7e06ce67fd7f90b1f2f6a297');
    expect(sha(CONSENT_COPY.ar)).toBe('aa8c2d78ec694f3f242c2ddb0b51d5f62e4fa10601ca196a91e7c510311d0757');
    expect(sha(CONSENT_COPY.fr)).toBe('b2979dbc0a45ba013d2fa34484c0bb86a26309dfd0f2e07dd3834eb42e85db49');
    expect(Object.keys(CONSENT_COPY).sort()).toEqual(['ar', 'en', 'fr', 'it']);
  });

  it('consent.js, ga.js, Analytics, ConsentBanner and CookieSettingsButton are byte-identical to origin/main', () => {
    expect(shaFile('analytics/consent.js')).toBe('97f0b469a3a0d6fe581f880356635b2bc31b88102f6a1ff74eb55407d6a060e8');
    expect(shaFile('analytics/ga.js')).toBe('421643cf5786a597640a82a5a3b478325e6f2d8c20513a5c6586ea8161e6d958');
    expect(shaFile('components/ui/ConsentBanner.jsx')).toBe('82c815698a2d8dd4813dee0a6e1f6b393516cd98f16201dbe1eb06fe3218842e');
    expect(shaFile('components/ui/CookieSettingsButton.jsx')).toBe('f96f838510f7e43430b594d45d0bc019778dedc3647049338531e5fbcd0b8437');
    expect(shaFile('components/ui/Analytics.jsx')).toBe('9a48482be0bb3d4e67f7572279ade41cabd8330d5b62565cb86126e48951e8d7');
    expect(CONSENT_STORAGE_KEY).toBe('alrahma.analyticsConsent.v1');
  });

  it('other languages still resolve as before (es/de fall back to English)', () => {
    expect(pickConsentCopy('es')).toBe(CONSENT_COPY.en);
    expect(pickConsentCopy('de')).toBe(CONSENT_COPY.en);
    expect(pickConsentCopy('it')).toBe(IT);
  });
});

describe('Italian consent copy', () => {
  it('has exactly the English keys, every value translated and non-empty', () => {
    expect(Object.keys(IT)).toEqual(Object.keys(CONSENT_COPY.en));
    for (const k of Object.keys(IT)) {
      expect(IT[k], k).toBeTruthy();
      expect(IT[k], k).not.toBe(CONSENT_COPY.en[k]);
    }
    expect(IT.region).toBe('Consenso ai cookie');
    expect(IT.accept).toBe('Accetta i cookie analitici');
    expect(IT.reject).toBe('Rifiuta');
    expect(IT.privacy).toBe('Informativa sulla privacy');
    expect(IT.settings).toBe('Impostazioni dei cookie');
    expect(IT.message).toContain('cookie analitici facoltativi');
  });

  it('the banner on /it/ shows every Italian text and its accessible name, with no English', () => {
    mount('/it/');
    const region = screen.getByRole('region', { name: IT.region });
    expect(region.getAttribute('aria-label')).toBe(IT.region);
    expect(region.textContent).toContain(IT.message);
    expect(screen.getByRole('button', { name: IT.accept })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: IT.reject })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: IT.privacy });
    expect(link.getAttribute('href')).toBe('/it/academy/privacy');
    const attrs = [...region.querySelectorAll('[aria-label],[title]')]
      .map((e) => `${e.getAttribute('aria-label')}|${e.getAttribute('title')}`)
      .join('|');
    const all = `${region.getAttribute('aria-label')}|${region.textContent}|${attrs}`;
    for (const en of [CONSENT_COPY.en.region, CONSENT_COPY.en.accept, CONSENT_COPY.en.reject, CONSENT_COPY.en.privacy, 'We use optional', 'Cookie']) {
      expect(all, en).not.toContain(en);
    }
  });

  it('the Cookie settings link is Italian', () => {
    mount('/it/', <CookieSettingsButton />);
    expect(screen.getByRole('button', { name: IT.settings })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cookie settings' })).toBeNull();
  });

  it('the English banner and settings link are unchanged on /', () => {
    mount('/', <CookieSettingsButton />);
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept analytics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cookie settings' })).toBeInTheDocument();
  });
});

describe('Privacy quotes the banner buttons verbatim', () => {
  it('Italian: accept and reject come from CONSENT_COPY.it and the same term is used throughout', () => {
    const P = ANALYTICS_PRIVACY_COPY.it;
    expect(P.when).toContain(`«${IT.accept}»`);
    expect(P.when).toContain(`«${IT.reject}»`);
    expect(P.title).toBe('Cookie analitici');
    expect(IT.accept).toContain('cookie analitici');
    expect(IT.message).toContain('cookie analitici');
  });

  it('English, Arabic and French quote their own buttons as before', () => {
    expect(ANALYTICS_PRIVACY_COPY.en.when).toContain(`“${CONSENT_COPY.en.accept}”`);
    expect(ANALYTICS_PRIVACY_COPY.en.when).toContain(`“${CONSENT_COPY.en.reject}”`);
    expect(ANALYTICS_PRIVACY_COPY.ar.when).toContain(`«${CONSENT_COPY.ar.accept}»`);
    expect(ANALYTICS_PRIVACY_COPY.fr.when).toContain(`« ${CONSENT_COPY.fr.accept} »`);
  });
});

describe('behaviour is exactly as before (the GA script tag is inspected, never fetched)', () => {
  const outcome = () => ({
    stored: window.localStorage.getItem(CONSENT_STORAGE_KEY),
    scripts: gaScripts().length,
    banner: !!screen.queryByRole('region'),
  });

  it('before any choice: nothing stored, no GA script, no gtag, no dataLayer', () => {
    mount('/it/');
    expect(outcome()).toEqual({ stored: null, scripts: 0, banner: true });
    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
  });

  it('Accept: stores granted, injects exactly one GA tag, closes the banner, same as English', () => {
    mount('/it/');
    fireEvent.click(screen.getByRole('button', { name: IT.accept }));
    const itOutcome = outcome();
    expect(itOutcome).toEqual({ stored: 'granted', scripts: 1, banner: false });
    reset();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    mount('/');
    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
    expect(outcome()).toEqual(itOutcome);
  });

  it('Reject: stores denied, loads nothing, closes the banner, same as English', () => {
    mount('/it/');
    fireEvent.click(screen.getByRole('button', { name: IT.reject }));
    const itOutcome = outcome();
    expect(itOutcome).toEqual({ stored: 'denied', scripts: 0, banner: false });
    expect(window.dataLayer).toBeUndefined();
    reset();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    mount('/');
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(outcome()).toEqual(itOutcome);
  });

  it('Cookie settings reopens the banner after a choice, and a new choice is stored', () => {
    mount('/it/', <CookieSettingsButton />);
    fireEvent.click(screen.getByRole('button', { name: IT.accept }));
    expect(screen.queryByRole('region')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: IT.settings }));
    expect(screen.getByRole('region', { name: IT.region })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: IT.reject }));
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('no banner and no settings link without a Measurement ID', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    mount('/it/', <CookieSettingsButton />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('button', { name: IT.settings })).toBeNull();
  });

  it('localStorage is clean at the start of every test', () => {
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });
});

describe('SEO and publication are untouched', () => {
  it('manifest has 34 Italian entries (incl. /enroll after the final publication), sitemap 132 URLs', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.locale === 'it')).toHaveLength(34);
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/enroll' && e.locale === 'it')).toHaveLength(1);
    const sitemap = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    expect((sitemap.match(/<loc>/g) || []).length).toBe(132);
  });

  it('the banner is never baked into prerendered HTML (webdriver hides it)', () => {
    Object.defineProperty(window.navigator, 'webdriver', { value: true, configurable: true, writable: true });
    try {
      mount('/it/');
      expect(screen.queryByRole('region')).toBeNull();
    } finally {
      delete window.navigator.webdriver;
    }
  });
});
