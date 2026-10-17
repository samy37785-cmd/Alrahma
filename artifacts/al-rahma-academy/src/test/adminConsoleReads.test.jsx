import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// AR-04: the admin console used to read trial leads, newsletter subscribers
// and a student's progress report through the regular-account API (http),
// which only works for a password-only `role: 'admin'` account and never
// passed the admin MFA or IP allowlist. They now go through adminHttp, the
// /api/v1/admin client, like every other admin tab.

const httpGet = vi.fn();
const adminGet = vi.fn();
vi.mock('../api/http', () => ({ default: { get: (...a) => httpGet(...a), post: vi.fn(), put: vi.fn() } }));
vi.mock('../api/adminHttp', () => ({ default: { get: (...a) => adminGet(...a), post: vi.fn(), delete: vi.fn() } }));
vi.mock('../hooks/useModalA11y', () => ({ useModalA11y: () => ({ current: null }) }));

const { getTrials, getSubscribers } = await import('../api/contentApi');
const { getUserCourseProgress, getUserHifzReport, listCertificates } = await import('../api/courseApi');
const { default: AdminProgressModal } = await import('../components/features/admin/AdminProgressModal');

beforeEach(() => {
  cleanup();
  httpGet.mockReset();
  adminGet.mockReset().mockResolvedValue({ data: [] });
});

describe('admin console reads use the MFA admin API', () => {
  it.each([
    ['trials', () => getTrials(), '/v1/admin/trials', undefined],
    ['newsletter subscribers', () => getSubscribers(), '/v1/admin/newsletter', undefined],
    ['course progress', () => getUserCourseProgress('u1'), '/v1/admin/users/u1/progress', undefined],
    ['memorisation', () => getUserHifzReport('u1'), '/v1/admin/users/u1/hifz', undefined],
    ['certificates', () => listCertificates('u1'), '/v1/admin/certificates', { params: { userId: 'u1' } }],
  ])('%s', async (_label, call, url, config) => {
    await call();
    expect(httpGet).not.toHaveBeenCalled();
    expect(adminGet).toHaveBeenCalledTimes(1);
    expect(adminGet.mock.calls[0][0]).toBe(url);
    if (config) expect(adminGet.mock.calls[0][1]).toEqual(config);
  });
});

describe('the progress window', () => {
  const user = { _id: 'u1', name: 'Amina', email: 'amina@example.com' };

  it('loads all three parts through the admin API', async () => {
    const onError = vi.fn();
    render(<AdminProgressModal user={user} onClose={() => {}} onError={onError} />);
    await waitFor(() => expect(adminGet).toHaveBeenCalledTimes(3));
    expect(adminGet.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/v1/admin/certificates', '/v1/admin/users/u1/hifz', '/v1/admin/users/u1/progress',
    ]);
    await waitFor(() => expect(screen.queryByText(/Loading report/)).toBeNull());
    expect(onError).not.toHaveBeenCalled();
  });

  it('says so when a part cannot be loaded, instead of showing an empty report as if the student had none', async () => {
    adminGet.mockImplementation((url) => (url.endsWith('/progress')
      ? Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } }))
      : Promise.resolve({ data: [] })));
    const onError = vi.fn();
    render(<AdminProgressModal user={user} onClose={() => {}} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toMatch(/course progress/);
  });
});
