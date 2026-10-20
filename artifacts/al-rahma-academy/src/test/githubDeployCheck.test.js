import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetGitHubCache, serverGitHubFailure, withBrowserGitHub } from '../utils/githubDeployCheck';

// The Service status card's own GitHub check, run in the browser when the
// server's check of GitHub failed. GitHub is a stand-in: no test reaches the
// network. Whatever is missing or failed must read "unknown" with the
// reason, never "up to date" or "no server change".

const MAIN = '9be0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8';
const OLD = '0af5fa7c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a';
const MAIN_PATH = '/repos/samy37785-cmd/Alrahma/commits/main';
const comparePath = (from, to) => `/repos/samy37785-cmd/Alrahma/compare/${from}...${to}`;
const mainCommit = { body: { sha: MAIN, commit: { committer: { date: '2026-10-20T15:39:30Z' } } } };
const compare = (body) => ({ body: { status: 'ahead', ahead_by: 2, ...body } });
const files = (...names) => names.map((filename) => ({ filename }));

// Answers by path; every other host fails the test. A route is
// { status, body, headers }, an Error to throw, or 'hang' (never answers
// until the request is aborted).
function fakeGitHub(routes = {}) {
  const fetchMock = vi.fn((url, init) => {
    const u = new URL(url);
    if (u.origin !== 'https://api.github.com') return Promise.reject(new Error(`unexpected request to ${u.origin}`));
    const route = routes[u.pathname];
    if (route === 'hang') {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    if (route instanceof Error) return Promise.reject(route);
    const { status: code = 200, body = {}, headers = {}, badJson = false } = route ?? { status: 404 };
    return Promise.resolve({
      ok: code >= 200 && code < 300,
      status: code,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => { if (badJson) throw new SyntaxError('Unexpected token'); return body; },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The server's answer when its own request to GitHub was refused.
const serverAnswer = (over = {}) => ({
  checkedAt: '2026-10-20T16:00:00.000Z',
  server: { commit: OLD },
  database: { status: 'ok', latencyMs: 12, checkedAt: '2026-10-20T16:00:00.000Z' },
  main: { status: 'unknown', reason: 'github_rate_limited' },
  serverDeploy: { verdict: 'unknown', reason: 'github_rate_limited' },
  ...over,
});

beforeEach(() => {
  vi.unstubAllGlobals();
  resetGitHubCache();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('serverGitHubFailure: when the browser asks GitHub itself', () => {
  it.each([
    ['main unknown', serverAnswer(), 'github_rate_limited'],
    ['main unknown, server commit unknown', serverAnswer({ server: { commit: null }, serverDeploy: { verdict: 'unknown', reason: 'server_commit_unknown' }, main: { status: 'unknown', reason: 'github_timeout' } }), 'github_timeout'],
    ['only the comparison failed', serverAnswer({ main: { status: 'ok', commit: MAIN }, serverDeploy: { verdict: 'unknown', reason: 'github_http_500' } }), 'github_http_500'],
    ['main missing from the answer', serverAnswer({ main: undefined }), 'github_bad_answer'],
  ])('%s: asks', (_name, answer, reason) => {
    expect(serverGitHubFailure(answer)).toBe(reason);
  });

  it.each([
    ['up to date', { verdict: 'up_to_date' }],
    ['likely needed', { verdict: 'likely_needed', serverFiles: [] }],
    ['no server change', { verdict: 'no_server_changes' }],
    ['not on main (GitHub said so)', { verdict: 'unknown', reason: 'server_commit_not_on_main' }],
    ['not found (GitHub said so)', { verdict: 'unknown', reason: 'server_commit_not_found' }],
    ['list cut short (GitHub said so)', { verdict: 'unknown', reason: 'compare_incomplete' }],
    ['server commit unknown', { verdict: 'unknown', reason: 'server_commit_unknown' }],
  ])('%s: does not ask', (_name, serverDeploy) => {
    expect(serverGitHubFailure(serverAnswer({ main: { status: 'ok', commit: MAIN }, serverDeploy }))).toBeNull();
  });
});

describe('withBrowserGitHub', () => {
  it("keeps the server's answer when its GitHub check worked, and asks nothing", async () => {
    const gh = fakeGitHub();
    const answer = serverAnswer({ main: { status: 'ok', commit: MAIN }, serverDeploy: { verdict: 'up_to_date' } });
    expect(await withBrowserGitHub(answer)).toEqual({ ...answer, github: { source: 'server' } });
    expect(gh).not.toHaveBeenCalled();
  });

  it('server files changed: likely needed, with renames out of backend/ and without backend/tests/', async () => {
    fakeGitHub({
      [MAIN_PATH]: mainCommit,
      [comparePath(OLD, MAIN)]: compare({ files: [
        { filename: 'backend/a.js' },
        { filename: 'scripts/moved.js', previous_filename: 'backend/moved.js' },
        { filename: 'backend/tests/a.test.js' },
        { filename: 'artifacts/al-rahma-academy/src/x.jsx' },
      ] }),
    });
    const out = await withBrowserGitHub(serverAnswer());
    expect(out.github).toEqual({ source: 'browser', serverReason: 'github_rate_limited' });
    expect(out.main).toMatchObject({ status: 'ok', commit: MAIN, committedAt: '2026-10-20T15:39:30Z' });
    expect(out.serverDeploy).toMatchObject({
      verdict: 'likely_needed', commitsBehind: 2, changedFiles: 4, listComplete: true,
      serverFileCount: 2, serverFiles: ['backend/a.js', 'scripts/moved.js'],
    });
    // The rest of the server's answer is kept as it was.
    expect(out.database).toEqual(serverAnswer().database);
    expect(out.server).toEqual({ commit: OLD });
  });

  it('only website, docs or server-test files changed: no server change', async () => {
    fakeGitHub({
      [MAIN_PATH]: mainCommit,
      [comparePath(OLD, MAIN)]: compare({ files: files('artifacts/al-rahma-academy/src/x.jsx', 'docs/y.md', 'backend/tests/z.test.js') }),
    });
    expect((await withBrowserGitHub(serverAnswer())).serverDeploy).toMatchObject({ verdict: 'no_server_changes', changedFiles: 3 });
  });

  it('a 300-file list: unknown without a server file in it, likely needed with one', async () => {
    const many = Array.from({ length: 300 }, (_, i) => `docs/f${i}.md`);
    fakeGitHub({ [MAIN_PATH]: mainCommit, [comparePath(OLD, MAIN)]: compare({ files: files(...many) }) });
    expect((await withBrowserGitHub(serverAnswer())).serverDeploy).toMatchObject({ verdict: 'unknown', reason: 'compare_incomplete', listComplete: false });

    resetGitHubCache();
    fakeGitHub({ [MAIN_PATH]: mainCommit, [comparePath(OLD, MAIN)]: compare({ files: files(...many.slice(1), 'backend/x.js') }) });
    expect((await withBrowserGitHub(serverAnswer())).serverDeploy).toMatchObject({ verdict: 'likely_needed', serverFileCount: 1, listComplete: false });
  });

  it('the server runs main: up to date, without a comparison', async () => {
    const gh = fakeGitHub({ [MAIN_PATH]: mainCommit });
    const out = await withBrowserGitHub(serverAnswer({ server: { commit: MAIN.slice(0, 7) } }));
    expect(out.serverDeploy).toEqual({ verdict: 'up_to_date' });
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['identical', { body: { status: 'identical', files: [] } }, { verdict: 'up_to_date' }],
    ['behind', compare({ status: 'behind', files: [] }), { verdict: 'unknown', reason: 'server_commit_not_on_main' }],
    ['diverged', compare({ status: 'diverged', files: files('backend/a.js') }), { verdict: 'unknown', reason: 'server_commit_not_on_main' }],
    ['no file list', compare({ files: undefined }), { verdict: 'unknown', reason: 'server_commit_not_on_main' }],
    ['unknown to GitHub (404)', { status: 404 }, { verdict: 'unknown', reason: 'server_commit_not_found' }],
  ])('a comparison that is %s', async (_name, route, verdict) => {
    fakeGitHub({ [MAIN_PATH]: mainCommit, [comparePath(OLD, MAIN)]: route });
    expect((await withBrowserGitHub(serverAnswer())).serverDeploy).toEqual(verdict);
  });

  it.each([
    ['rate limited (403, none remaining)', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }, 'github_rate_limited'],
    ['rate limited (429, none remaining)', { status: 429, headers: { 'x-ratelimit-remaining': '0' } }, 'github_rate_limited'],
    ['forbidden for another reason', { status: 403, headers: { 'x-ratelimit-remaining': '42' } }, 'github_http_403'],
    ['a server error', { status: 500 }, 'github_http_500'],
    ['a network failure', new TypeError('Failed to fetch'), 'github_unreachable'],
    ['an answer that is not JSON', { badJson: true }, 'github_bad_answer'],
    ['an answer without a commit', { body: { sha: 'not-a-sha' } }, 'github_bad_answer'],
  ])('main fails in the browser (%s): main and the deploy line are unknown with the reason', async (_name, route, reason) => {
    const gh = fakeGitHub({ [MAIN_PATH]: route });
    const out = await withBrowserGitHub(serverAnswer({ server: { commit: MAIN } }));
    expect(out.main).toEqual({ status: 'unknown', reason });
    // Even though the server runs main's commit, nothing says so without GitHub.
    expect(out.serverDeploy).toEqual({ verdict: 'unknown', reason });
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it('the comparison fails in the browser: unknown with the reason, main is still shown', async () => {
    fakeGitHub({ [MAIN_PATH]: mainCommit, [comparePath(OLD, MAIN)]: { status: 403, headers: { 'x-ratelimit-remaining': '0' } } });
    const out = await withBrowserGitHub(serverAnswer());
    expect(out.main).toMatchObject({ status: 'ok', commit: MAIN });
    expect(out.serverDeploy).toEqual({ verdict: 'unknown', reason: 'github_rate_limited' });
  });

  it('GitHub does not answer in 5 seconds: github_timeout', async () => {
    vi.useFakeTimers();
    fakeGitHub({ [MAIN_PATH]: 'hang' });
    const pending = withBrowserGitHub(serverAnswer());
    await vi.advanceTimersByTimeAsync(4999);
    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await pending;
    expect(out.main).toEqual({ status: 'unknown', reason: 'github_timeout' });
    expect(out.serverDeploy).toEqual({ verdict: 'unknown', reason: 'github_timeout' });
  });

  it('the server did not report its commit: only main is asked, and the deploy line stays unknown', async () => {
    const gh = fakeGitHub({ [MAIN_PATH]: mainCommit });
    const out = await withBrowserGitHub(serverAnswer({ server: { commit: null }, serverDeploy: { verdict: 'unknown', reason: 'server_commit_unknown' } }));
    expect(out.main).toMatchObject({ status: 'ok', commit: MAIN });
    expect(out.serverDeploy).toEqual({ verdict: 'unknown', reason: 'server_commit_unknown' });
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it('a malformed server commit is never put in a GitHub URL', async () => {
    const gh = fakeGitHub({ [MAIN_PATH]: mainCommit });
    const out = await withBrowserGitHub(serverAnswer({ server: { commit: '../../evil?x=1' } }));
    expect(out.serverDeploy).toEqual({ verdict: 'unknown', reason: 'server_commit_unknown' });
    expect(gh.mock.calls.map(([url]) => url)).toEqual(['https://api.github.com/repos/samy37785-cmd/Alrahma/commits/main']);
  });

  it("the app's request options: credentials omitted, no Referer, and no header added but Accept", async () => {
    const gh = fakeGitHub({ [MAIN_PATH]: mainCommit, [comparePath(OLD, MAIN)]: compare({ files: [] }) });
    await withBrowserGitHub(serverAnswer());
    expect(gh).toHaveBeenCalledTimes(2);
    // What the app passes to fetch. The headers a browser adds on its own
    // (Origin, User-Agent, Sec-Fetch-*) are not visible here.
    for (const [url, init] of gh.mock.calls) {
      expect(url.startsWith('https://api.github.com/repos/samy37785-cmd/Alrahma/')).toBe(true);
      expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });
      expect(init.headers).toEqual({ Accept: 'application/vnd.github+json' });
    }
  });

  it('answers are kept 5 minutes, failures 1 minute', async () => {
    const now = vi.spyOn(Date, 'now');
    let t = 1_000_000;
    now.mockImplementation(() => t);

    const gh = fakeGitHub({ [MAIN_PATH]: mainCommit, [comparePath(OLD, MAIN)]: compare({ files: files('backend/a.js') }) });
    await withBrowserGitHub(serverAnswer());
    t += 4 * 60 * 1000 + 59 * 1000;
    await withBrowserGitHub(serverAnswer());
    expect(gh).toHaveBeenCalledTimes(2);
    t += 2000;
    await withBrowserGitHub(serverAnswer());
    expect(gh).toHaveBeenCalledTimes(4);

    resetGitHubCache();
    const failing = fakeGitHub({ [MAIN_PATH]: { status: 403, headers: { 'x-ratelimit-remaining': '0' } } });
    await withBrowserGitHub(serverAnswer());
    t += 59 * 1000;
    await withBrowserGitHub(serverAnswer());
    expect(failing).toHaveBeenCalledTimes(1);
    t += 2000;
    await withBrowserGitHub(serverAnswer());
    expect(failing).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});
