import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The Overview tab's Service status card: checked only when the admin asks,
// every line a snapshot of that moment, and "Unknown" with the reason
// whenever a fact is missing or a source failed (never "no deploy needed").

const build = vi.hoisted(() => ({ commit: null }));
vi.mock('../utils/buildInfo', () => ({ get BUILD_COMMIT() { return build.commit; } }));
vi.mock('../api/adminApi', () => ({ getServiceStatus: vi.fn() }));

import { getServiceStatus } from '../api/adminApi';
import AdminServiceStatus from '../components/features/admin/AdminServiceStatus';

const MAIN = '9be0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8';
const OLD = '0af5fa7c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a';
const status = (over = {}) => ({
  checkedAt: '2026-10-20T16:00:00.000Z',
  server: { commit: MAIN },
  database: { status: 'ok', latencyMs: 12, checkedAt: '2026-10-20T16:00:00.000Z' },
  main: { status: 'ok', commit: MAIN, committedAt: '2026-10-20T15:39:30Z', fetchedAt: '2026-10-20T16:00:00.000Z' },
  serverDeploy: { verdict: 'up_to_date' },
  ...over,
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AdminServiceStatus /></QueryClientProvider>);
  return qc;
}
const check = async (label = 'Check now') => {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Check again|Check now/ })).toBeEnabled());
};
const line = (id) => screen.getByTestId(id).textContent;

describe('AdminServiceStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    build.commit = MAIN;
  });

  it('checks nothing until asked, and the console Refresh does not run it', async () => {
    const qc = renderCard();
    await qc.invalidateQueries({ queryKey: ['admin'] });
    expect(getServiceStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/when you press Check now/)).toBeInTheDocument();

    getServiceStatus.mockResolvedValue(status());
    await check();
    expect(getServiceStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('service-checked-at')).toHaveTextContent('Each line is a snapshot of that moment');
  });

  it('all up to date: both commits, the timed ping, and the healthz caveat', async () => {
    getServiceStatus.mockResolvedValue(status());
    renderCard();
    await check();
    expect(line('service-website')).toContain('Built from 9be0c1d, the latest commit on main.');
    expect(line('service-server')).toContain('Runs 9be0c1d.');
    expect(line('service-server')).toContain('not that the database is connected');
    expect(line('service-database')).toContain('Answered a ping in 12 ms');
    expect(line('service-database')).toContain('at the time of this check only');
    expect(line('service-main')).toContain('9be0c1d, committed');
    expect(line('service-deploy')).toContain('Up to date: the server runs the latest commit on main.');
  });

  it('server files changed: probably needs a Manual Deploy, with the files and how many more', async () => {
    getServiceStatus.mockResolvedValue(status({
      server: { commit: OLD },
      serverDeploy: {
        verdict: 'likely_needed', commitsBehind: 3, changedFiles: 60, listComplete: true,
        serverFileCount: 52, serverFiles: Array.from({ length: 50 }, (_, i) => `backend/f${i}.js`),
      },
    }));
    renderCard();
    await check();
    expect(line('service-deploy')).toContain('Probably needs a Manual Deploy: 52 server files changed in the 3 commits since the one it runs.');
    expect(screen.getByText('backend/f0.js')).toBeInTheDocument();
    expect(screen.getByText('and 2 more')).toBeInTheDocument();
  });

  it('no server file changed: probably not needed, and says it is not proof', async () => {
    getServiceStatus.mockResolvedValue(status({
      server: { commit: OLD },
      serverDeploy: { verdict: 'no_server_changes', commitsBehind: 1, changedFiles: 2, listComplete: true },
    }));
    renderCard();
    await check();
    expect(line('service-deploy')).toContain('No server file changed in the 1 commit since the one it runs, so a deploy is probably not needed. This is not proof.');
  });

  it.each([
    ['server_commit_unknown', 'the server did not report which commit it runs'],
    ['github_rate_limited', "GitHub's limit for requests without a key was reached"],
    ['compare_incomplete', "GitHub's list of changed files may be cut short"],
    ['server_commit_not_on_main', 'the server runs a commit that is not part of main'],
    ['github_http_502', 'GitHub answered with an error (HTTP 502)'],
  ])('an unknown answer (%s) says Unknown and why, never "not needed"', async (reason, text) => {
    getServiceStatus.mockResolvedValue(status({ serverDeploy: { verdict: 'unknown', reason } }));
    renderCard();
    await check();
    expect(line('service-deploy')).toContain(`Unknown: ${text}`);
    expect(line('service-deploy')).not.toMatch(/not needed|Up to date/);
  });

  it('the website line: unknown build, a build behind main, and main unknown', async () => {
    build.commit = null;
    getServiceStatus.mockResolvedValue(status());
    renderCard();
    await check();
    expect(line('service-website')).toContain('Unknown: this build does not say which commit it was made from.');

    build.commit = OLD;
    await check('Check again');
    expect(line('service-website')).toContain('Built from 0af5fa7; main is at 9be0c1d. Vercel may still be deploying, or its deploy failed');

    getServiceStatus.mockResolvedValue(status({ main: { status: 'unknown', reason: 'github_unreachable' }, serverDeploy: { verdict: 'unknown', reason: 'github_unreachable' } }));
    await check('Check again');
    expect(line('service-website')).toContain('Compared with main: Unknown: GitHub could not be reached.');
    expect(line('service-main')).toContain('Unknown: GitHub could not be reached.');
  });

  it('a database that does not answer is shown as such', async () => {
    getServiceStatus.mockResolvedValue(status({ database: { status: 'error', reason: 'not_connected', checkedAt: '2026-10-20T16:00:00.000Z' } }));
    renderCard();
    await check();
    expect(line('service-database')).toContain('Did not answer (not connected)');
  });

  it('a failed check says why and does not leave the previous answer on screen', async () => {
    getServiceStatus.mockResolvedValue(status());
    renderCard();
    await check();
    expect(screen.getByTestId('service-deploy')).toBeInTheDocument();

    for (const [err, text] of [
      [{ response: { status: 403 } }, 'No permission to view this (it needs the audit:read permission).'],
      [{ response: { status: 503 } }, 'The server answered 503: it could not reach the database.'],
      [{ response: { status: 502 } }, 'Could not check (HTTP 502).'],
      [new Error('Network Error'), 'Could not check: no answer from the server.'],
    ]) {
      getServiceStatus.mockRejectedValueOnce(err);
      await check('Check again');
      expect(screen.getByRole('alert')).toHaveTextContent(text);
      expect(screen.queryByTestId('service-deploy')).not.toBeInTheDocument();
      getServiceStatus.mockResolvedValue(status());
    }
  });
});
