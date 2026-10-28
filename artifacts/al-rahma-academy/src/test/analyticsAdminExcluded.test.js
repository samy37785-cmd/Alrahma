import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetConsentForTests, writeConsent } from '../analytics/consent';
import { __resetGaForTests, isAdminPath, trackEvent, trackPageView } from '../analytics/ga';

const TEST_ID = 'G-TEST12345';

function events() {
  return (window.dataLayer || []).map((entry) => Array.from(entry)).filter((c) => c[0] === 'event');
}
function pageViewPaths() {
  return events().filter((c) => c[1] === 'page_view').map((c) => c[2].page_path);
}

function reset() {
  window.localStorage.clear();
  __resetConsentForTests();
  __resetGaForTests();
  document.querySelectorAll('script').forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
}

function visit(path) {
  window.history.replaceState({}, '', path);
  trackPageView();
}

describe('GA4 ignores the admin console', () => {
  beforeEach(() => {
    reset();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    writeConsent('granted');
  });
  afterEach(() => {
    reset();
    window.history.replaceState({}, '', '/');
    vi.unstubAllEnvs();
  });

  it('matches the console pages in every language and nothing else', () => {
    for (const path of ['/admin', '/admin/', '/admin/login', '/ar/admin', '/it/admin/login', '/de/admin/']) {
      expect(isAdminPath(path), path).toBe(true);
    }
    for (const path of ['/', '/ar/', '/administration', '/admins', '/enroll', '/it/enroll', '/tools/admin', '/blog/admin-tips']) {
      expect(isAdminPath(path), path).toBe(false);
    }
  });

  it('sends no page_view for the console pages', () => {
    for (const path of ['/admin/login', '/admin', '/ar/admin', '/fr/admin/login']) visit(path);

    expect(events()).toHaveLength(0);
  });

  it('sends no event from the console, so staff WhatsApp replies are not counted as contacts', () => {
    window.history.replaceState({}, '', '/admin');
    trackEvent('whatsapp_click');
    trackEvent('email_click');

    expect(events()).toHaveLength(0);
  });

  it('counts the public page again when staff leave the console', () => {
    visit('/it/');
    visit('/admin');
    visit('/it/');

    expect(pageViewPaths()).toEqual(['/it/', '/it/']);
  });

  it('still counts public pages and events as before', () => {
    visit('/enroll');
    trackEvent('whatsapp_click');

    expect(events().map((c) => c[1])).toEqual(['page_view', 'whatsapp_click']);
  });
});
