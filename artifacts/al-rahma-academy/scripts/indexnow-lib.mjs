// IndexNow (https://www.indexnow.org/documentation) helpers. Pure functions plus one submit() that takes its
// fetch as a parameter, so everything is testable without a network.
//
// The IndexNow key is PUBLIC by design: the protocol requires the same value to be readable at
// https://<host>/<key>.txt so the search engine can prove you own the host. It is a fresh random value
// (not derived from, and not reused as, any credential), and rotating it means adding a new
// public/<key>.txt and changing INDEXNOW_KEY here.
import { PRERENDER_MANIFEST, canonicalUrlFor } from './prerender-routes.mjs';

export const INDEXNOW_KEY = '4ad559b8bd48785b6f7e500549db4dda';
export const INDEXNOW_HOST = 'al-rahmaacademy.com';
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';
export const MAX_BATCH = 100; // protocol allows 10,000; we stay far below it
export const MAX_WITHOUT_ALL = 50; // a full-site send must be asked for explicitly with --all
export const TIMEOUT_MS = 10_000;

/** Every canonical URL that is published in the prerender manifest (the only URLs we may ever send). */
export function publishedUrls() {
  return PRERENDER_MANIFEST.filter((e) => e.status === 'published' && e.indexable !== false).map((e) => canonicalUrlFor(e));
}

/**
 * Split a list of candidate URLs into accepted and rejected (with a reason). A URL is accepted only if, after
 * dropping a fragment, it is exactly one of the published canonical URLs: that single rule rejects http, www,
 * Preview/localhost hosts, query strings, Spanish/German paths and every unpublished route. Duplicates are
 * collapsed (reported once as accepted, counted in `duplicates`).
 */
export function validateUrls(candidates, allowed = publishedUrls()) {
  const allow = new Set(allowed);
  const accepted = [];
  const rejected = [];
  let duplicates = 0;
  const seen = new Set();
  for (const raw of candidates) {
    const input = String(raw ?? '').trim();
    if (!input) continue;
    let url;
    try {
      const u = new URL(input);
      u.hash = '';
      url = u.href;
    } catch {
      rejected.push({ url: input, reason: 'not a URL' });
      continue;
    }
    if (!url.startsWith('https://')) { rejected.push({ url: input, reason: 'not https' }); continue; }
    if (new URL(url).hostname !== INDEXNOW_HOST) { rejected.push({ url: input, reason: `host is not ${INDEXNOW_HOST}` }); continue; }
    if (!allow.has(url)) { rejected.push({ url: input, reason: 'not a published canonical URL' }); continue; }
    if (seen.has(url)) { duplicates += 1; continue; }
    seen.add(url);
    accepted.push(url);
  }
  return { accepted, rejected, duplicates };
}

export function chunk(list, size = MAX_BATCH) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function buildPayload(urlList) {
  return { host: INDEXNOW_HOST, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_LOCATION, urlList };
}

/**
 * POST each batch. Never throws: a network error, timeout or non-2xx status is reported in the result, so a
 * failed submission can never break whatever called it. The result carries only counts and HTTP statuses.
 */
export async function submit(urls, { fetchImpl = fetch, endpoint = INDEXNOW_ENDPOINT, timeoutMs = TIMEOUT_MS } = {}) {
  const batches = [];
  for (const urlList of chunk(urls)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(buildPayload(urlList)),
        signal: controller.signal,
      });
      batches.push({ urls: urlList.length, status: res.status, ok: res.status >= 200 && res.status < 300 });
    } catch (error) {
      batches.push({ urls: urlList.length, status: null, ok: false, error: error?.name === 'AbortError' ? 'timeout' : 'network' });
    } finally {
      clearTimeout(timer);
    }
  }
  return { batches, ok: batches.every((b) => b.ok) };
}
