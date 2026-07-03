/*
 * Tiny localStorage-backed cache with TTL + stale-on-error fallback.
 *
 * Why: the Quran and prayer-time data come from third-party APIs
 * (api.quran.com, alquran.cloud, api.aladhan.com). If one is slow, rate-limited
 * or down, the page would otherwise break. With this helper we:
 *   1. serve a fresh cached copy instantly when it's still within its TTL
 *      (fewer network calls, faster repeat visits), and
 *   2. fall back to the last successful copy — even if expired — when the
 *      network request fails, so the user still sees content.
 *
 * Static religious content (chapter list, verse text) gets a long TTL; volatile
 * data (prayer times) gets a short one but still benefits from stale fallback.
 */

const PREFIX = 'cache:';

// localStorage can be unavailable (private mode, quota, SSR). Never let the
// cache layer itself throw — degrade to a no-op so the live request still runs.
function readRaw(key) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Quota exceeded or storage blocked — caching is best-effort, so ignore.
  }
}

function readEntry(key) {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (entry && typeof entry.ts === 'number' && 'data' in entry) return entry;
  } catch {
    // Corrupt entry — drop it.
  }
  return null;
}

/**
 * Run `producer` (an async fn returning the data) through the cache.
 *
 * @param {string}   key       unique cache key for these exact params
 * @param {number}   ttlMs     how long a cached copy is considered fresh
 * @param {Function} producer  async () => data, called on a miss/stale
 * @returns {Promise<any>} the data (fresh, or stale on network failure)
 */
export async function withCache(key, ttlMs, producer) {
  const entry = readEntry(key);
  const now = Date.now();

  // Fresh hit — return immediately, no network.
  if (entry && now - entry.ts < ttlMs) return entry.data;

  try {
    const data = await producer();
    writeRaw(key, JSON.stringify({ ts: now, data }));
    return data;
  } catch (err) {
    // Network/API failed — serve the last good copy if we have one.
    if (entry) return entry.data;
    throw err;
  }
}

// Manually drop one cached key (e.g. on a "refresh" button).
export function invalidate(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

// Common TTLs.
export const TTL = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
};
