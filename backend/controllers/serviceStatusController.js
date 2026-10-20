import mongoose from 'mongoose';
import logger from '../config/logger.js';

// The admin console's Service status card. No keys and no settings: every
// fact comes from what this server already knows (its own commit, a ping to
// its own database) and from GitHub's public API for this public repository.
//
// Whenever a fact is missing or a source fails, the answer is "unknown" with
// the reason. It is never read as "no deploy needed".
//
// What it cannot tell: whether a Render or Vercel build failed, deploy logs,
// a deploy in progress, or changed environment variables on Render. Those
// need a platform token, which this deliberately does not use.

const REPO = 'samy37785-cmd/Alrahma';
const GITHUB_API = 'https://api.github.com';
const GITHUB_TIMEOUT_MS = 5000;
const PING_TIMEOUT_MS = 3000;
// Unauthenticated GitHub calls allow 60 an hour per IP address, and Render
// shares outbound addresses between services, so answers are kept for five
// minutes (failures for one) instead of asking on every check.
const CACHE_MS = 5 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 1000;
// Render runs the server from backend/ only (`node server.js`) and never
// runs its tests, so a change anywhere else (the website, docs, CI) or only
// under backend/tests/ does not need a Render deploy.
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
export function resetServiceStatusCache() {
  cache.clear();
}

function serverCommit() {
  const sha = process.env.RENDER_GIT_COMMIT || '';
  return SHA.test(sha) ? sha.toLowerCase() : null;
}

// A ping at this moment: it says nothing about a second later.
async function pingDatabase() {
  const checkedAt = new Date().toISOString();
  if (mongoose.connection.readyState !== 1) return { status: 'error', reason: 'not_connected', checkedAt };
  const started = process.hrtime.bigint();
  let timer;
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ping timed out')), PING_TIMEOUT_MS); }),
    ]);
    const latencyMs = Math.max(1, Math.round(Number(process.hrtime.bigint() - started) / 1e6));
    return { status: 'ok', latencyMs, checkedAt };
  } catch (err) {
    logger.warn('service status: database ping failed', { message: err.message });
    return { status: 'error', reason: 'ping_failed', checkedAt };
  } finally {
    clearTimeout(timer);
  }
}

// GET a GitHub API path, cached. Resolves to { ok: true, data, fetchedAt }
// or { ok: false, reason }; GitHub's own error text is never passed on.
async function github(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < (hit.value.ok ? CACHE_MS : FAILURE_CACHE_MS)) return hit.value;

  let value;
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'alrahma-admin-service-status',
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (res.ok) {
      value = { ok: true, data: await res.json(), fetchedAt: new Date().toISOString() };
    } else {
      const limited = (res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0';
      value = { ok: false, reason: limited ? 'github_rate_limited' : `github_http_${res.status}` };
    }
  } catch (err) {
    value = { ok: false, reason: err?.name === 'TimeoutError' ? 'github_timeout' : 'github_unreachable' };
  }
  if (!value.ok) logger.warn('service status: GitHub request failed', { reason: value.reason });
  cache.set(path, { at: Date.now(), value });
  return value;
}

async function latestMain() {
  const res = await github(`/repos/${REPO}/commits/main`);
  const sha = res.ok ? res.data?.sha : null;
  if (!res.ok || !SHA.test(sha || '')) return { status: 'unknown', reason: res.ok ? 'github_bad_answer' : res.reason };
  return {
    status: 'ok',
    commit: sha.toLowerCase(),
    committedAt: res.data.commit?.committer?.date ?? null,
    fetchedAt: res.fetchedAt,
  };
}

const unknown = (reason) => ({ verdict: 'unknown', reason });

// Does the server need a Render deploy to run main? Only a strong hint,
// never proof: a change outside the repository (environment variables on
// Render) or a deploy already running is invisible from here.
async function serverDeploy(server, main) {
  if (!server) return unknown('server_commit_unknown');
  if (main.status !== 'ok') return unknown(main.reason);
  if (main.commit.startsWith(server) || server.startsWith(main.commit)) return { verdict: 'up_to_date' };

  const res = await github(`/repos/${REPO}/compare/${server}...${main.commit}`);
  if (!res.ok) return unknown(res.reason === 'github_http_404' ? 'server_commit_not_found' : res.reason);
  const { status, ahead_by: aheadBy, files } = res.data ?? {};
  if (status === 'identical') return { verdict: 'up_to_date' };
  // 'behind' or 'diverged': the server runs a commit main does not contain
  // (another branch, say). Nothing can be concluded from main's history.
  if (status !== 'ahead' || !Array.isArray(files)) return unknown('server_commit_not_on_main');

  const serverFiles = files.filter((f) => isServerFile(f.filename) || isServerFile(f.previous_filename)).map((f) => f.filename);
  const complete = files.length < COMPARE_FILE_LIMIT;
  const counts = { commitsBehind: aheadBy ?? null, changedFiles: files.length, listComplete: complete, comparedAt: res.fetchedAt };
  if (serverFiles.length > 0) {
    return { verdict: 'likely_needed', ...counts, serverFileCount: serverFiles.length, serverFiles: serverFiles.slice(0, LISTED_FILES) };
  }
  if (!complete) return { ...unknown('compare_incomplete'), ...counts };
  return { verdict: 'no_server_changes', ...counts };
}

// @desc   Service status for the admin console
// @route  GET /api/v1/admin/stats/service-status
// @access Admin (MFA + IP allowlist + audit:read). Mongo only.
export async function getServiceStatus(_req, res) {
  const server = serverCommit();
  const [database, main] = await Promise.all([pingDatabase(), latestMain()]);
  const deploy = await serverDeploy(server, main);
  res.set('Cache-Control', 'no-store');
  res.json({
    checkedAt: new Date().toISOString(),
    server: { commit: server },
    database,
    main,
    serverDeploy: deploy,
  });
}
