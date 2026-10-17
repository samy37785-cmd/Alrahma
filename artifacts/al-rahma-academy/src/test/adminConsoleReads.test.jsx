import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';

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

  // One record per part, so each part's own content can be looked for.
  const DATA = {
    progress: [{ courseId: 'c1', title: 'Tajweed Foundations', icon: '📖', done: 1, total: 4, percent: 25 }],
    hifz: [{ _id: 'u1:1', chapterId: 1, chapterName: 'Al-Fatiha', totalVerses: 7, memorizedVerses: [1, 2, 3] }],
    certificates: [{ _id: 'cert1', title: 'Juz Amma completion', certificateNumber: 'CERT-2026-0001', type: 'completion' }],
  };
  const SHOWS = {
    progress: /Tajweed Foundations/, // rendered after the course icon
    hifz: /Al-Fatiha/,
    certificates: /Juz Amma completion/,
  };
  const FAILURE = {
    progress: /Could not load course progress/,
    hifz: /Could not load memorization progress/,
    certificates: /Could not load certificates/,
  };
  const EMPTY_TEXT = {
    progress: 'No course activity yet.',
    hifz: 'No memorization recorded yet.',
  };
  const partOf = (url) => (url.endsWith('/progress') ? 'progress' : url.endsWith('/hifz') ? 'hifz' : 'certificates');
  const forbidden = () => Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } }));

  // Serves DATA (or empty lists), failing the parts named in `failing`.
  function serve({ failing = [], empty = false } = {}) {
    adminGet.mockImplementation((url) => {
      const part = partOf(url);
      if (failing.includes(part)) return forbidden();
      return Promise.resolve({ data: empty ? [] : DATA[part] });
    });
  }

  async function openWindow() {
    const onError = vi.fn();
    render(<AdminProgressModal user={user} onClose={() => {}} onError={onError} />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).queryByText(/Loading report/)).toBeNull());
    return { dialog: within(dialog), onError };
  }

  it('loads all three parts through the admin API and shows every one of them', async () => {
    serve();
    const { dialog, onError } = await openWindow();
    expect(adminGet.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/v1/admin/certificates', '/v1/admin/users/u1/hifz', '/v1/admin/users/u1/progress',
    ]);
    for (const part of Object.keys(SHOWS)) expect(dialog.getByText(SHOWS[part])).toBeTruthy();
    expect(dialog.getByText('1/4')).toBeTruthy();
    expect(dialog.queryByRole('alert')).toBeNull();
    for (const text of Object.values(EMPTY_TEXT)) expect(dialog.queryByText(text)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('a student with genuinely no records still sees the "nothing yet" text, and no error', async () => {
    serve({ empty: true });
    const { dialog } = await openWindow();
    for (const text of Object.values(EMPTY_TEXT)) expect(dialog.getByText(text)).toBeTruthy();
    expect(dialog.queryByRole('alert')).toBeNull();
  });

  it.each(['progress', 'hifz', 'certificates'])(
    'when %s fails: its own message shows in the window, not an empty state, and the other parts stay',
    async (failingPart) => {
      serve({ failing: [failingPart] });
      const { dialog, onError } = await openWindow();

      const alerts = dialog.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toMatch(FAILURE[failingPart]);
      expect(alerts[0].textContent).toMatch(/not an empty record/);

      if (EMPTY_TEXT[failingPart]) expect(dialog.queryByText(EMPTY_TEXT[failingPart])).toBeNull();
      expect(dialog.queryByText(SHOWS[failingPart])).toBeNull();

      for (const part of Object.keys(SHOWS).filter((p) => p !== failingPart)) {
        expect(dialog.getByText(SHOWS[part])).toBeTruthy();
        expect(dialog.queryByText(FAILURE[part])).toBeNull();
      }
      // The message is in the window itself, not the page banner behind it.
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it('when every part fails: three messages, no "nothing yet" text, and the certificate form is still there', async () => {
    serve({ failing: ['progress', 'hifz', 'certificates'] });
    const { dialog } = await openWindow();
    const alerts = dialog.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toHaveLength(3);
    for (const pattern of Object.values(FAILURE)) expect(alerts.some((t) => pattern.test(t))).toBe(true);
    for (const text of Object.values(EMPTY_TEXT)) expect(dialog.queryByText(text)).toBeNull();
    expect(dialog.getByRole('button', { name: /Issue certificate/ })).toBeTruthy();
  });
});
