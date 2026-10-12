import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetConsentForTests, writeConsent } from '../analytics/consent';
import { __resetGaForTests, sanitizeParams, trackPageView } from '../analytics/ga';

const TEST_ID = 'G-TEST12345';

function gtagCalls() {
  return (window.dataLayer || []).map((entry) => Array.from(entry));
}
function pageViews() {
  return gtagCalls().filter((c) => c[0] === 'event' && c[1] === 'page_view').map((c) => c[2]);
}
function configLocation() {
  const config = gtagCalls().find((c) => c[0] === 'config');
  return config && config[2].page_location;
}

function reset() {
  window.localStorage.clear();
  __resetConsentForTests();
  __resetGaForTests();
  document.querySelectorAll('script').forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
}

function land(url) {
  window.history.replaceState({}, '', url);
  trackPageView();
}

describe('GA4 campaign tags (utm_*)', () => {
  beforeEach(() => {
    reset();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    writeConsent('granted');
  });
  afterEach(() => {
    reset();
    vi.unstubAllEnvs();
  });

  it('keeps the utm_* tags in page_location and drops every other parameter and the hash', () => {
    land('/it/enroll?email=someone%40example.com&utm_campaign=ramadan_2027&fbclid=IwAR0abc&utm_source=instagram&teacher=3&utm_medium=social#top');

    const [view] = pageViews();
    const origin = window.location.origin;
    expect(view.page_path).toBe('/it/enroll');
    expect(view.page_location).toBe(`${origin}/it/enroll?utm_source=instagram&utm_medium=social&utm_campaign=ramadan_2027`);
    expect(configLocation()).toBe(view.page_location);
    expect(JSON.stringify(gtagCalls())).not.toMatch(/someone|example\.com|fbclid|IwAR0abc|teacher=|#top/);
  });

  it('keeps all five utm_* tags', () => {
    land('/?utm_term=quran_kids&utm_content=video01&utm_campaign=c1&utm_medium=cpc&utm_source=meta');

    expect(pageViews()[0].page_location).toBe(
      `${window.location.origin}/?utm_source=meta&utm_medium=cpc&utm_campaign=c1&utm_content=video01&utm_term=quran_kids`,
    );
  });

  it('drops a utm_* value that could carry personal data or is malformed', () => {
    land(`/?utm_source=someone%40example.com&utm_medium=hello%20world&utm_campaign=${'x'.repeat(101)}&utm_content=%2B201000000000&utm_term=ok_term`);

    expect(pageViews()[0].page_location).toBe(`${window.location.origin}/?utm_term=ok_term`);
    expect(JSON.stringify(gtagCalls())).not.toMatch(/someone|example\.com|hello|201000000000|x{101}/);
  });

  it('a page with no campaign tags gets a plain origin + pathname', () => {
    land('/fr/courses?plan=gold');

    expect(pageViews()[0].page_location).toBe(`${window.location.origin}/fr/courses`);
  });

  it('the next page in the visit carries no tags once the URL no longer has them', () => {
    land('/?utm_source=whatsapp&utm_medium=chat');
    window.history.pushState({}, '', '/courses');
    trackPageView();

    const views = pageViews();
    expect(views).toHaveLength(2);
    expect(views[1].page_location).toBe(`${window.location.origin}/courses`);
  });

  it('the page_location validator accepts only utm_* tags in the query string', () => {
    const base = 'https://al-rahmaacademy.com/it/';
    const ok = (loc) => sanitizeParams('page_view', { page_location: loc }).page_location;

    expect(ok(base)).toBe(base);
    expect(ok(`${base}?utm_source=instagram&utm_medium=social`)).toBe(`${base}?utm_source=instagram&utm_medium=social`);
    expect(ok(`${base}?email=a@b.c`)).toBeUndefined();
    expect(ok(`${base}?utm_source=instagram&email=a`)).toBeUndefined();
    expect(ok(`${base}?utm_source=a@b.c`)).toBeUndefined();
    expect(ok(`${base}?gclid=abc`)).toBeUndefined();
    expect(ok(`${base}#top`)).toBeUndefined();
  });
});
