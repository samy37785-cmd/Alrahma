import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Analytics, { contactEventForHref } from '../components/ui/Analytics';
import ConsentBanner from '../components/ui/ConsentBanner';
import CookieSettingsButton from '../components/ui/CookieSettingsButton';
import {
  CONSENT_STORAGE_KEY,
  __resetConsentForTests,
  openConsentSettings,
  writeConsent,
} from '../analytics/consent';
import { GA_SCRIPT_ID, __resetGaForTests, sanitizeParams, trackEvent } from '../analytics/ga';
import { site } from '../data/site';

vi.mock('../components/layout/Header', () => ({ default: () => null }));
vi.mock('../components/layout/Footer', () => ({ default: () => null }));

const TEST_ID = 'G-TEST12345';

function gtagCalls() {
  return (window.dataLayer || []).map((entry) => Array.from(entry));
}
function events(name) {
  return gtagCalls().filter((c) => c[0] === 'event' && (!name || c[1] === name));
}
function gaScripts() {
  return document.querySelectorAll('script[src*="googletagmanager.com"]');
}

let navigateRef = null;
function NavigateProbe() {
  navigateRef = useNavigate();
  return null;
}

function renderSite(path, children = null) {
  window.history.replaceState({}, '', path);
  const { basename } = langFromPath(path);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <Analytics />
        <ConsentBanner />
        <NavigateProbe />
        {children}
      </LangProvider>
    </BrowserRouter>,
  );
}

function resetEverything() {
  cleanup();
  window.localStorage.clear();
  __resetConsentForTests();
  __resetGaForTests();
  document.querySelectorAll('script').forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
  delete window[`ga-disable-${TEST_ID}`];
  navigateRef = null;
}

describe('GA4 analytics consent gate', () => {
  beforeEach(() => {
    resetEverything();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
  });
  afterEach(() => {
    resetEverything();
    vi.unstubAllEnvs();
  });

  it('loads nothing and sends nothing before consent, and nothing after Reject', () => {
    renderSite('/');
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
    expect(gaScripts()).toHaveLength(0);
    expect(document.getElementById(GA_SCRIPT_ID)).toBeNull();
    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();

    // A page component firing an event before consent is a no-op too.
    trackEvent('faq_show_all');
    expect(window.dataLayer).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).toBeNull();
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied');
    act(() => navigateRef('/courses'));
    trackEvent('faq_show_all');
    expect(gaScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it('shows no banner, no settings link and loads nothing when no Measurement ID is configured', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    renderSite('/', <CookieSettingsButton />);
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cookie settings' })).toBeNull();
    writeConsent('granted');
    trackEvent('faq_show_all');
    expect(gaScripts()).toHaveLength(0);
  });

  it('after Accept injects exactly one tag, even when loading is triggered again', () => {
    renderSite('/');
    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
    expect(gaScripts()).toHaveLength(1);
    expect(gaScripts()[0].src).toContain(`id=${TEST_ID}`);

    // Remounting the component and events that self-initialise GA must not add a second tag.
    cleanup();
    renderSite('/tools');
    trackEvent('faq_show_all');
    expect(gaScripts()).toHaveLength(1);
    expect(gtagCalls().filter((c) => c[0] === 'config')).toHaveLength(1);
    const config = gtagCalls().find((c) => c[0] === 'config');
    expect(config[2]).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  });

  it('sends one page_view per SPA route change, and none for query/hash-only changes', () => {
    writeConsent('granted');
    renderSite('/');
    expect(events('page_view')).toHaveLength(1);

    act(() => navigateRef('/courses'));
    expect(events('page_view')).toHaveLength(2);
    expect(events('page_view')[1][2].page_path).toBe('/courses');

    act(() => navigateRef('/courses?plan=gold#faq'));
    expect(events('page_view')).toHaveLength(2);

    act(() => navigateRef('/'));
    expect(events('page_view')).toHaveLength(3);
  });

  it('strips query strings and hashes from page_path and page_location', () => {
    writeConsent('granted');
    renderSite('/enroll?email=someone%40example.com&teacher=3#top');
    const [, , params] = events('page_view')[0];
    expect(params.page_path).toBe('/enroll');
    expect(params.page_location).toBe(`${window.location.origin}/enroll`);
    expect(JSON.stringify(gtagCalls())).not.toMatch(/someone|example\.com|teacher=|#top/);
  });

  it('only sends allow-listed parameters (no PII), and drops unknown events', () => {
    writeConsent('granted');
    renderSite('/');
    trackEvent('enroll_step_view', {
      step: 2, name: 'Amina Test', email: 'amina@example.com', phone: '+201000000000', whatsapp: '+201000000000',
    });
    trackEvent('adhkar_category_change', { category: 'amina@example.com' });
    trackEvent('adhkar_category_change', { category: 'baadSalah' });
    trackEvent('enroll_submit', { step: 4 });

    const step = events('enroll_step_view')[0][2];
    expect(Object.keys(step).sort()).toEqual(['page_path', 'site_lang', 'step']);
    expect(step.step).toBe(2);
    const cats = events('adhkar_category_change').map((e) => e[2].category);
    expect(cats).toEqual([undefined, 'baadSalah']);
    expect(events('enroll_submit')).toHaveLength(0);
    expect(JSON.stringify(gtagCalls())).not.toMatch(/Amina|example\.com|201000000000/);
    expect(sanitizeParams('page_view', { page_path: '/x?email=a@b.c' })).toEqual({});
  });

  it('tracks WhatsApp/email clicks without the number or the address', () => {
    writeConsent('granted');
    renderSite('/', (
      <>
        <a href={`https://wa.me/${site.whatsapp}?text=hi`}>wa</a>
        <a href={`mailto:${site.email}`}>mail</a>
        <a href="https://wa.me/?text=share">share</a>
      </>
    ));
    for (const text of ['wa', 'mail', 'share']) {
      const link = screen.getByText(text);
      link.addEventListener('click', (e) => e.preventDefault());
      fireEvent.click(link);
    }
    expect(events('whatsapp_click')).toHaveLength(1);
    expect(events('email_click')).toHaveLength(1);
    const serialized = JSON.stringify(gtagCalls());
    expect(serialized).not.toContain(site.whatsapp);
    expect(serialized).not.toContain(site.email);
    expect(contactEventForHref('https://wa.me/?text=x')).toBeNull();
  });

  it('English pages report site_lang "en" and show the English banner', () => {
    renderSite('/enroll');
    expect(screen.getByText(/Analytics will not load unless you choose Accept\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
    const pv = events('page_view')[0][2];
    expect(pv).toMatchObject({ page_path: '/enroll', site_lang: 'en' });
  });

  it('Arabic pages report site_lang "ar", full /ar path, and show the Arabic banner', () => {
    renderSite('/ar/enroll');
    const banner = screen.getByRole('region', { name: 'الموافقة على ملفات تعريف الارتباط' });
    expect(banner).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText(/لن يتم تحميل أدوات التحليلات إلا إذا اخترت الموافقة/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'السماح بالتحليلات' }));
    const pv = events('page_view')[0][2];
    expect(pv).toMatchObject({ page_path: '/ar/enroll', site_lang: 'ar' });
    act(() => navigateRef('/tools/adhkar'));
    expect(events('page_view')[1][2]).toMatchObject({ page_path: '/ar/tools/adhkar', site_lang: 'ar' });
  });

  it('consent can be withdrawn from Cookie settings: sending stops and GA cookies are removed', () => {
    renderSite('/', <CookieSettingsButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).toBeNull();
    document.cookie = '_ga=GA1.1.123.456; path=/';
    document.cookie = '_ga_TEST12345=GS1.1.1; path=/';

    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(window[`ga-disable-${TEST_ID}`]).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    const before = events().length;
    act(() => navigateRef('/courses'));
    trackEvent('faq_show_all');
    expect(events()).toHaveLength(before);

    // And it can be given again.
    act(() => openConsentSettings());
    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
    expect(window[`ga-disable-${TEST_ID}`]).toBe(false);
    expect(gaScripts()).toHaveLength(1);
  });
});

describe('Enroll analytics events', () => {
  beforeEach(() => {
    resetEverything();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    writeConsent('granted');
  });
  afterEach(() => {
    resetEverything();
    vi.unstubAllEnvs();
  });

  it('sends enroll_view on open and enroll_step_view with the step number only', async () => {
    const { default: Enroll } = await import('../pages/Enroll');
    const { container } = renderSite('/enroll', <Enroll />);
    expect(events('enroll_view')).toHaveLength(1);
    expect(events('enroll_step_view')).toHaveLength(0);
    // page_view is recorded before the page's own event.
    const names = events().map((e) => e[1]);
    expect(names.indexOf('page_view')).toBeLessThan(names.indexOf('enroll_view'));

    const inputs = container.querySelectorAll('.enroll__card input');
    fireEvent.change(inputs[0], { target: { value: 'Amina Test' } });
    fireEvent.change(container.querySelector('#enroll-email'), { target: { value: 'amina@example.com' } });
    fireEvent.change(container.querySelector('#enroll-whatsapp'), { target: { value: '+201000000000' } });
    fireEvent.click(container.querySelector('.enroll__nav .btn--green'));

    expect(events('enroll_step_view')).toHaveLength(1);
    expect(events('enroll_step_view')[0][2]).toEqual({ page_path: '/enroll', site_lang: 'en', step: 2 });
    expect(JSON.stringify(gtagCalls())).not.toMatch(/Amina|example\.com|201000000000/);
  });
});
