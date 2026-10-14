import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetConsentForTests, writeConsent } from '../analytics/consent';
import { __resetGaForTests } from '../analytics/ga';

const post = vi.fn();
vi.mock('../api/http', () => ({ default: { post: (...a) => post(...a), get: vi.fn() } }));
vi.mock('../api/adminHttp', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

const { submitTrial } = await import('../api/contentApi');
const { submitEnrollment } = await import('../api/enrollmentApi');

const TEST_ID = 'G-TEST12345';
const PERSON = {
  name: 'Amina Test',
  email: 'amina@example.com',
  whatsapp: '+201000000000',
  phone: '+201000000000',
};

function gtagCalls() {
  return (window.dataLayer || []).map((entry) => Array.from(entry));
}
function events(name) {
  return gtagCalls().filter((c) => c[0] === 'event' && c[1] === name);
}

function reset() {
  window.localStorage.clear();
  __resetConsentForTests();
  __resetGaForTests();
  document.querySelectorAll('script').forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
  post.mockReset();
}

describe('GA4 conversion events', () => {
  beforeEach(() => {
    reset();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    window.history.replaceState({}, '', '/it/enroll');
  });
  afterEach(() => {
    reset();
    vi.unstubAllEnvs();
  });

  it('sends booking_submitted once the booking request succeeds, with no form data', async () => {
    writeConsent('granted');
    post.mockResolvedValue({ data: { bookingRef: 'AR-TEST01' } });

    const res = await submitEnrollment({ ...PERSON, plan: 'Noorani' });

    expect(res).toEqual({ bookingRef: 'AR-TEST01' });
    expect(events('booking_submitted')).toHaveLength(1);
    expect(events('booking_submitted')[0][2]).toEqual({ page_path: '/it/enroll', site_lang: 'it' });
    expect(JSON.stringify(gtagCalls())).not.toMatch(/Amina|example\.com|201000000000|AR-TEST01|Noorani/);
  });

  it('sends trial_submitted with which form was used', async () => {
    writeConsent('granted');
    window.history.replaceState({}, '', '/fr/');
    post.mockResolvedValue({ data: { ok: true } });

    await submitTrial({ ...PERSON });
    await submitTrial({ ...PERSON, source: 'hero-quick-trial' });
    await submitTrial({ ...PERSON, source: 'exit-intent' });
    await submitTrial({ ...PERSON, source: 'something-new' });

    expect(events('trial_submitted').map((e) => e[2])).toEqual([
      { page_path: '/fr/', site_lang: 'fr', form: 'trial_section' },
      { page_path: '/fr/', site_lang: 'fr', form: 'quick_trial' },
      { page_path: '/fr/', site_lang: 'fr', form: 'exit_intent' },
      { page_path: '/fr/', site_lang: 'fr', form: 'trial_section' },
    ]);
    expect(JSON.stringify(gtagCalls())).not.toMatch(/Amina|example\.com|201000000000/);
  });

  // Audit item 8: where the lead came from.
  it('trial_submitted carries the "heard from" answer only when it is a known value', async () => {
    writeConsent('granted');
    window.history.replaceState({}, '', '/it/');
    post.mockResolvedValue({ data: { ok: true } });

    await submitTrial({ ...PERSON, heardFrom: 'instagram' });
    await submitTrial({ ...PERSON, heardFrom: 'amina@example.com' });

    expect(events('trial_submitted').map((e) => e[2])).toEqual([
      { page_path: '/it/', site_lang: 'it', form: 'trial_section', heard_from: 'instagram' },
      { page_path: '/it/', site_lang: 'it', form: 'trial_section' },
    ]);
  });

  it('the trial request sends which form was used and the page campaign tags (valid ones only)', async () => {
    window.history.replaceState({}, '', '/it/?utm_source=instagram&utm_medium=social&utm_campaign=amina@example.com&ref=x');
    post.mockResolvedValue({ data: { ok: true } });

    await submitTrial({ ...PERSON, source: 'hero-quick-trial', heardFrom: 'friend_family' });

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/trials');
    expect(body).toMatchObject({ formSource: 'quick_trial', heardFrom: 'friend_family', utmSource: 'instagram', utmMedium: 'social' });
    expect(body.utmCampaign).toBeUndefined();
    expect(body.ref).toBeUndefined();
  });

  it('sends nothing when the request fails', async () => {
    writeConsent('granted');
    post.mockRejectedValue(new Error('500'));

    await expect(submitEnrollment({ ...PERSON })).rejects.toThrow('500');
    await expect(submitTrial({ ...PERSON })).rejects.toThrow('500');

    expect(events('booking_submitted')).toHaveLength(0);
    expect(events('trial_submitted')).toHaveLength(0);
  });

  it('sends nothing and loads nothing without analytics consent', async () => {
    post.mockResolvedValue({ data: { bookingRef: 'AR-TEST02' } });

    await submitEnrollment({ ...PERSON });
    writeConsent('denied');
    await submitTrial({ ...PERSON });

    expect(window.dataLayer).toBeUndefined();
    expect(document.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
  });

  it('a broken analytics call never turns an accepted request into a failure', async () => {
    writeConsent('granted');
    post.mockResolvedValue({ data: { bookingRef: 'AR-TEST03' } });
    // Simulate GA already loaded but its gtag throwing.
    window.dataLayer = [];
    window.gtag = () => { throw new Error('gtag broke'); };
    const tag = document.createElement('script');
    tag.id = 'alrahma-ga4';
    document.head.appendChild(tag);

    await expect(submitEnrollment({ ...PERSON })).resolves.toEqual({ bookingRef: 'AR-TEST03' });
    await expect(submitTrial({ ...PERSON })).resolves.toEqual({ bookingRef: 'AR-TEST03' });
  });
});
