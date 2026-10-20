import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The Overview tab's Service status card: checked only when the admin asks,
// every line a snapshot of that moment, and "Unknown" with the reason
// whenever a fact is missing or a source failed (never "no deploy needed").
// When the server could not ask GitHub, the browser asks GitHub itself.
// GitHub is a stand-in here: no test reaches the network.

const build = vi.hoisted(() => ({ commit: null }));
vi.mock('../utils/buildInfo', () => ({ get BUILD_COMMIT() { return build.commit; } }));
vi.mock('../api/adminApi', () => ({ getServiceStatus: vi.fn() }));

import { getServiceStatus } from '../api/adminApi';
import AdminServiceStatus from '../components/features/admin/AdminServiceStatus';
import { resetGitHubCache } from '../utils/githubDeployCheck';

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

// A stand-in for GitHub's API, answering by path. Every other host fails
// the test. A route is { status, body, headers } or an Error to throw.
const REPO_API = 'https://api.github.com/repos/samy37785-cmd/Alrahma';
function fakeGitHub(routes = {}) {
  const fetchMock = vi.fn(async (url) => {
    const u = new URL(url);
    if (u.origin !== 'https://api.github.com') throw new Error(`unexpected request to ${u.origin}`);
    const route = routes[u.pathname];
    if (route instanceof Error) throw route;
    const { status: code = 200, body = {}, headers = {} } = route ?? { status: 404 };
    return {
      ok: code >= 200 && code < 300,
      status: code,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const MAIN_PATH = '/repos/samy37785-cmd/Alrahma/commits/main';
const comparePath = (from, to) => `/repos/samy37785-cmd/Alrahma/compare/${from}...${to}`;
const mainCommit = { body: { sha: MAIN, commit: { committer: { date: '2026-10-20T15:39:30Z' } } } };
const ahead = (files, aheadBy = 3) => ({ body: { status: 'ahead', ahead_by: aheadBy, files: files.map((filename) => ({ filename })) } });
const RATE_LIMITED = { status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0' } };
// The server's answer when its own request to GitHub failed.
const serverGitHubFailed = (reason = 'github_rate_limited', server = OLD) => status({
  server: { commit: server },
  main: { status: 'unknown', reason },
  serverDeploy: { verdict: 'unknown', reason },
});

describe('AdminServiceStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    resetGitHubCache();
    build.commit = MAIN;
    fakeGitHub();
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
    ['compare_incomplete', "GitHub's list of changed files may be cut short"],
    ['server_commit_not_on_main', 'the server runs a commit that is not part of main'],
  ])('an unknown answer GitHub itself gave (%s) says Unknown and why, never "not needed", and is not asked again', async (reason, text) => {
    getServiceStatus.mockResolvedValue(status({ server: { commit: OLD }, serverDeploy: { verdict: 'unknown', reason } }));
    renderCard();
    await check();
    expect(line('service-deploy')).toContain(`Unknown: ${text}`);
    expect(line('service-deploy')).not.toMatch(/not needed|Up to date/);
    expect(fetch).not.toHaveBeenCalled();
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

    // GitHub failed for the server and for this browser.
    fakeGitHub({ [MAIN_PATH]: new TypeError('Failed to fetch') });
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

describe('AdminServiceStatus: the browser asks GitHub when the server could not', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    resetGitHubCache();
    build.commit = MAIN;
  });

  it("the server's GitHub answer worked: the browser does not ask GitHub", async () => {
    const gh = fakeGitHub({ [MAIN_PATH]: mainCommit });
    getServiceStatus.mockResolvedValue(status());
    renderCard();
    await check();
    expect(gh).not.toHaveBeenCalled();
    expect(line('service-main')).toContain("From GitHub's public API, without a key.");
    expect(line('service-main')).not.toContain('this browser');
  });

  it('success: main and the comparison come from the browser; the app adds only Accept, omits credentials and sends no Referer', async () => {
    const gh = fakeGitHub({
      [MAIN_PATH]: mainCommit,
      [comparePath(OLD, MAIN)]: ahead(['backend/controllers/a.js', 'backend/routes/b.js', 'artifacts/al-rahma-academy/src/c.jsx']),
    });
    getServiceStatus.mockResolvedValue(serverGitHubFailed('github_rate_limited'));
    renderCard();
    await check();

    expect(line('service-main')).toContain('9be0c1d, committed');
    expect(line('service-main')).toContain("The server could not ask GitHub (GitHub's limit for requests without a key was reached; try again in a while), so this browser asked GitHub's public API itself, without a key and without your session.");
    expect(line('service-website')).toContain('Built from 9be0c1d, the latest commit on main.');
    expect(line('service-deploy')).toContain('Probably needs a Manual Deploy: 2 server files changed in the 3 commits since the one it runs.');
    expect(line('service-deploy')).toContain('(asked by this browser)');
    expect(screen.getByText('backend/controllers/a.js')).toBeInTheDocument();
    expect(screen.queryByText('artifacts/al-rahma-academy/src/c.jsx')).not.toBeInTheDocument();

    expect(gh.mock.calls.map(([url]) => url)).toEqual([`${REPO_API}/commits/main`, `${REPO_API}/compare/${OLD}...${MAIN}`]);
    // What the app passes to fetch. The headers a browser adds on its own
    // (Origin, User-Agent, Sec-Fetch-*) are not visible here.
    for (const [, init] of gh.mock.calls) {
      expect(init.method).toBe('GET');
      expect(init.credentials).toBe('omit');
      expect(init.referrerPolicy).toBe('no-referrer');
      expect(init.headers).toEqual({ Accept: 'application/vnd.github+json' });
      expect(init.body).toBeUndefined();
    }
  });

  it('a website-only change: no server file changed, probably not needed, not proof', async () => {
    fakeGitHub({
      [MAIN_PATH]: mainCommit,
      [comparePath(OLD, MAIN)]: ahead(['artifacts/al-rahma-academy/src/a.jsx', 'docs/b.md', 'backend/tests/c.test.js'], 2),
    });
    getServiceStatus.mockResolvedValue(serverGitHubFailed('github_rate_limited'));
    renderCard();
    await check();
    expect(line('service-deploy')).toContain('No server file changed in the 2 commits since the one it runs, so a deploy is probably not needed. This is not proof.');
  });

  it("GitHub's limit is reached for the browser too: Unknown with the reason, never up to date", async () => {
    const gh = fakeGitHub({ [MAIN_PATH]: RATE_LIMITED });
    // The server runs main's commit: only GitHub could have said so.
    getServiceStatus.mockResolvedValue(serverGitHubFailed('github_rate_limited', MAIN));
    renderCard();
    await check();
    expect(line('service-main')).toContain("Unknown: GitHub's limit for requests without a key was reached; try again in a while.");
    expect(line('service-website')).toContain('Compared with main: Unknown');
    expect(line('service-deploy')).toContain("Unknown: GitHub's limit for requests without a key was reached");
    expect(line('service-deploy')).not.toMatch(/Up to date|not needed/);
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it('a network failure in the browser: Unknown, GitHub could not be reached', async () => {
    fakeGitHub({ [MAIN_PATH]: new TypeError('Failed to fetch') });
    getServiceStatus.mockResolvedValue(serverGitHubFailed('github_timeout'));
    renderCard();
    await check();
    expect(line('service-main')).toContain('Unknown: GitHub could not be reached.');
    expect(line('service-main')).toContain('The server could not ask GitHub (GitHub did not answer in time)');
    expect(line('service-deploy')).toContain('Unknown: GitHub could not be reached.');
    expect(line('service-deploy')).not.toMatch(/Up to date|not needed/);
  });

  it('an HTTP error from GitHub in the browser says which one', async () => {
    fakeGitHub({ [MAIN_PATH]: { status: 502 } });
    getServiceStatus.mockResolvedValue(serverGitHubFailed('github_http_502'));
    renderCard();
    await check();
    expect(line('service-deploy')).toContain('Unknown: GitHub answered with an error (HTTP 502).');
    expect(line('service-main')).toContain('The server could not ask GitHub (GitHub answered with an error (HTTP 502))');
  });

  it("only the server's comparison failed: the browser compares, using main from the server", async () => {
    const gh = fakeGitHub({ [comparePath(OLD, MAIN)]: ahead(['backend/server.js'], 1) });
    getServiceStatus.mockResolvedValue(status({ server: { commit: OLD }, serverDeploy: { verdict: 'unknown', reason: 'github_rate_limited' } }));
    renderCard();
    await check();
    expect(gh.mock.calls.map(([url]) => url)).toEqual([`${REPO_API}/compare/${OLD}...${MAIN}`]);
    expect(line('service-deploy')).toContain('Probably needs a Manual Deploy: 1 server file changed in the 1 commit since the one it runs.');
  });

  it('pressing Check again within 5 minutes does not ask GitHub again', async () => {
    const gh = fakeGitHub({ [MAIN_PATH]: mainCommit, [comparePath(OLD, MAIN)]: ahead(['backend/server.js']) });
    getServiceStatus.mockResolvedValue(serverGitHubFailed('github_rate_limited'));
    renderCard();
    await check();
    await check('Check again');
    await check('Check again');
    expect(getServiceStatus).toHaveBeenCalledTimes(3);
    expect(gh).toHaveBeenCalledTimes(2);
    expect(line('service-deploy')).toContain('Probably needs a Manual Deploy');
  });
});
