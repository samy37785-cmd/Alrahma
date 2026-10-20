// The Service status card's GitHub check, run from the admin's own browser
// when the server's check of GitHub failed. The server runs on Render, whose
// outbound addresses are shared with other services, so GitHub's limit for
// requests without a key (60 an hour per address) is often used up before
// it asks. This browser's address has its own limit.
//
// Only GET requests to GitHub's public API for this public repository, with
// no body. The one header this code adds is Accept: no key, no token, no
// Authorization. credentials: 'omit' sends no cookies or other session data,
// and referrerPolicy: 'no-referrer' sends no Referer, so the admin page's
// address stays here. The browser still adds its own standard headers to a
// cross-site (CORS) request, such as Origin, User-Agent and Sec-Fetch-*.
// Origin names only the public site's domain, not the admin session, MFA or
// the page's path. The rules match the server's check in
// backend/controllers/serviceStatusController.js: anything missing or failed
// is "unknown" with the reason, never "no deploy needed".

const REPO = 'samy37785-cmd/Alrahma';
const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 5000;
// Answers are kept for five minutes (failures for one), so pressing
// "Check again" does not spend this browser's limit.
const CACHE_MS = 5 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 1000;
// Render runs the server from backend/ only and never runs its tests.
const SERVER_PATH = 'backend/';
const NOT_RUN_ON_SERVER = 'backend/tests/';
const isServerFile = (name) => typeof name === 'string' && name.startsWith(SERVER_PATH) && !name.startsWith(NOT_RUN_ON_SERVER);
// GitHub's compare lists at most 300 changed files. A list that long may be
// cut short, so finding no server file in it proves nothing.
const COMPARE_FILE_LIMIT = 300;
const LISTED_FILES = 50;
const SHA = /^[0-9a-f]{7,40}$/i;

const cache = new Map();

// Tests only: forget cached GitHub answers.
export function resetGitHubCache() {
  cache.clear();
}

// GET a GitHub API path, cached. Resolves to { ok: true, data, fetchedAt }
// or { ok: false, reason }; it never throws.
async function github(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < (hit.value.ok ? CACHE_MS : FAILURE_CACHE_MS)) return hit.value;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  let value;
  try {
    // Accept is the only header added here; the browser adds its own.
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (res.ok) {
      try {
        value = { ok: true, data: await res.json(), fetchedAt: new Date().toISOString() };
      } catch {
        value = { ok: false, reason: timedOut ? 'github_timeout' : 'github_bad_answer' };
      }
    } else {
      const limited = (res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0';
      value = { ok: false, reason: limited ? 'github_rate_limited' : `github_http_${res.status}` };
    }
  } catch {
    value = { ok: false, reason: timedOut ? 'github_timeout' : 'github_unreachable' };
  } finally {
    clearTimeout(timer);
  }
  cache.set(path, { at: Date.now(), value });
  return value;
}

async function latestMain() {
  const res = await github(`/repos/${REPO}/commits/main`);
  const sha = res.ok ? res.data?.sha : null;
  if (!res.ok || typeof sha !== 'string' || !SHA.test(sha)) return { status: 'unknown', reason: res.ok ? 'github_bad_answer' : res.reason };
  return {
    status: 'ok',
    commit: sha.toLowerCase(),
    committedAt: res.data.commit?.committer?.date ?? null,
    fetchedAt: res.fetchedAt,
  };
}

const unknown = (reason) => ({ verdict: 'unknown', reason });

// Does the server need a Render deploy to run main? Only a strong hint,
// never proof, exactly as on the server.
async function serverDeploy(server, main) {
  if (!server) return unknown('server_commit_unknown');
  if (main.status !== 'ok') return unknown(main.reason);
  if (main.commit.startsWith(server) || server.startsWith(main.commit)) return { verdict: 'up_to_date' };

  const res = await github(`/repos/${REPO}/compare/${server}...${main.commit}`);
  if (!res.ok) return unknown(res.reason === 'github_http_404' ? 'server_commit_not_found' : res.reason);
  const { status, ahead_by: aheadBy, files } = res.data ?? {};
  if (status === 'identical') return { verdict: 'up_to_date' };
  // 'behind' or 'diverged': the server runs a commit main does not contain.
  if (status !== 'ahead' || !Array.isArray(files)) return unknown('server_commit_not_on_main');

  const serverFiles = files.filter((f) => isServerFile(f?.filename) || isServerFile(f?.previous_filename)).map((f) => f.filename);
  const complete = files.length < COMPARE_FILE_LIMIT;
  const counts = { commitsBehind: Number.isInteger(aheadBy) ? aheadBy : null, changedFiles: files.length, listComplete: complete, comparedAt: res.fetchedAt };
  if (serverFiles.length > 0) {
    return { verdict: 'likely_needed', ...counts, serverFileCount: serverFiles.length, serverFiles: serverFiles.slice(0, LISTED_FILES) };
  }
  if (!complete) return { ...unknown('compare_incomplete'), ...counts };
  return { verdict: 'no_server_changes', ...counts };
}

// The server's GitHub answer failed when main is unknown, or when the deploy
// line is unknown because a GitHub request failed. Answers GitHub itself gave
// (the server's commit is not on main, a list cut short) are not asked again.
const githubFailed = (reason) => typeof reason === 'string' && reason.startsWith('github_');

export function serverGitHubFailure(status) {
  if (status?.main?.status !== 'ok') return status?.main?.reason ?? 'github_bad_answer';
  if (status.serverDeploy?.verdict === 'unknown' && githubFailed(status.serverDeploy.reason)) return status.serverDeploy.reason;
  return null;
}

// The server's answer, with main and the deploy line asked again from this
// browser when the server's GitHub check failed. `github` says which one
// answered and, for the browser, why the server's answer was not used.
export async function withBrowserGitHub(status) {
  const serverReason = serverGitHubFailure(status);
  if (!serverReason) return { ...status, github: { source: 'server' } };

  const raw = status.server?.commit;
  const server = typeof raw === 'string' && SHA.test(raw) ? raw.toLowerCase() : null;
  const main = status.main?.status === 'ok' ? status.main : await latestMain();
  return {
    ...status,
    main,
    serverDeploy: await serverDeploy(server, main),
    github: { source: 'browser', serverReason },
  };
}
