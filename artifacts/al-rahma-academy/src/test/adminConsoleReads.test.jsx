import { describe, it, expect, beforeEach, vi } from 'vitest';

// AR-04: the admin console's Trials and Newsletter tabs used to read through
// the regular-account API (http), which only worked for a password-only
// `role: 'admin'` account and never passed the admin MFA or IP allowlist.
// They now go through adminHttp, the /api/v1/admin client, like every other
// admin tab. The public forms that write the same data (trial request,
// newsletter signup, booking) are not admin reads and stay on http.

const httpGet = vi.fn();
const httpPost = vi.fn();
const adminGet = vi.fn();
const adminPost = vi.fn();
vi.mock('../api/http', () => ({ default: { get: (...a) => httpGet(...a), post: (...a) => httpPost(...a), put: vi.fn() } }));
vi.mock('../api/adminHttp', () => ({ default: { get: (...a) => adminGet(...a), post: (...a) => adminPost(...a), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../analytics/ga', () => ({ trackTrialSubmitted: vi.fn(), trackBookingSubmitted: vi.fn() }));

const { getTrials, getSubscribers, submitTrial, subscribeNewsletter } = await import('../api/contentApi');
const { submitEnrollment } = await import('../api/enrollmentApi');

beforeEach(() => {
  httpGet.mockReset();
  httpPost.mockReset().mockResolvedValue({ data: { ok: true } });
  adminGet.mockReset().mockResolvedValue({ data: [] });
  adminPost.mockReset();
});

describe('the Trials and Newsletter tabs read through the MFA admin API', () => {
  it.each([
    ['trials', () => getTrials(), '/v1/admin/trials'],
    ['newsletter subscribers', () => getSubscribers(), '/v1/admin/newsletter'],
  ])('%s', async (_label, call, url) => {
    await call();
    expect(httpGet).not.toHaveBeenCalled();
    expect(adminGet).toHaveBeenCalledTimes(1);
    expect(adminGet.mock.calls[0][0]).toBe(url);
  });
});

describe('the public forms still post through the regular API, with no admin session', () => {
  it.each([
    ['trial request', () => submitTrial({ name: 'Visitor', email: 'visitor@example.com', source: 'trial_section' }), '/trials'],
    ['newsletter signup', () => subscribeNewsletter('reader@example.com'), '/newsletter'],
    ['booking request', () => submitEnrollment({ name: 'Visitor', email: 'visitor@example.com', whatsapp: '+447700900000' }), '/enrollments'],
  ])('%s', async (_label, call, url) => {
    await call();
    expect(httpPost).toHaveBeenCalledTimes(1);
    expect(httpPost.mock.calls[0][0]).toBe(url);
    expect(adminPost).not.toHaveBeenCalled();
    expect(adminGet).not.toHaveBeenCalled();
  });
});
