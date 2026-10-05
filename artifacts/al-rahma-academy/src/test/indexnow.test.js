import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INDEXNOW_KEY, INDEXNOW_HOST, INDEXNOW_KEY_LOCATION, INDEXNOW_ENDPOINT, MAX_BATCH,
  publishedUrls, validateUrls, chunk, buildPayload, submit,
} from '../../scripts/indexnow-lib.mjs';
import { run, parseArgs } from '../../scripts/indexnow-submit.mjs';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPO = path.resolve(ROOT, '../..');
const read = (p) => fs.readFileSync(p, 'utf8');

const TAJWEED = 'https://al-rahmaacademy.com/it/tools/tajweed-checker';

describe('key file', () => {
  it('is 32 lowercase hex characters', () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
  });
  it('public/<key>.txt contains exactly the key, as the protocol requires', () => {
    const file = path.join(ROOT, 'public', `${INDEXNOW_KEY}.txt`);
    expect(fs.existsSync(file)).toBe(true);
    expect(read(file)).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY_LOCATION).toBe(`https://al-rahmaacademy.com/${INDEXNOW_KEY}.txt`);
  });
  it('is independent: it appears nowhere else in the repo source except the lib and its key file', () => {
    // A fresh random value; checking that it was not pasted into other config.
    for (const f of ['vercel.json', 'package.json', 'index.html', 'public/robots.txt', 'public/llms.txt']) {
      const p = f === 'vercel.json' ? path.join(REPO, f) : path.join(ROOT, f);
      if (fs.existsSync(p)) expect(read(p)).not.toContain(INDEXNOW_KEY);
    }
  });
  it('the key file is not listed in the sitemap', () => {
    expect(read(path.join(ROOT, 'public/sitemap.xml'))).not.toContain(INDEXNOW_KEY);
  });
});

describe('URL validation', () => {
  const published = publishedUrls();

  it('allows exactly the published canonical URLs: all 134, none of them es/de', () => {
    expect(published).toHaveLength(134);
    expect(published.some((u) => /\/(es|de)(\/|$)/.test(new URL(u).pathname))).toBe(false);
    const { accepted, rejected } = validateUrls(published);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(134);
  });

  it.each([
    ['http', 'http://al-rahmaacademy.com/it/'],
    ['www host', 'https://www.al-rahmaacademy.com/it/'],
    ['Preview deployment', 'https://alrahma-8rj5uiini-samy37785-cmds-projects.vercel.app/it/'],
    ['localhost', 'http://localhost:5173/it/'],
    ['lookalike host', 'https://al-rahmaacademy.com.evil.example/it/'],
    ['query string', 'https://al-rahmaacademy.com/it/?lang=fr'],
    ['unpublished Spanish', 'https://al-rahmaacademy.com/es/'],
    ['unpublished German', 'https://al-rahmaacademy.com/de/tools/hadith'],
    ['unpublished Italian route', 'https://al-rahmaacademy.com/it/tools/qibla'],
    ['unpublished English route', 'https://al-rahmaacademy.com/tools/hadith'],
    ['missing trailing slash on a language home', 'https://al-rahmaacademy.com/it'],
    ['not a URL', 'it/tools/tajweed-checker'],
    ['a key file', INDEXNOW_KEY_LOCATION],
  ])('rejects %s', (_label, url) => {
    const { accepted, rejected } = validateUrls([url]);
    expect(accepted).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it('drops a fragment, collapses duplicates and ignores blank lines', () => {
    const { accepted, duplicates } = validateUrls([TAJWEED, `${TAJWEED}#top`, '', '  ', TAJWEED]);
    expect(accepted).toEqual([TAJWEED]);
    expect(duplicates).toBe(2);
  });

  it('every published Italian page is accepted', () => {
    const it = PRERENDER_MANIFEST.filter((e) => e.locale === 'it' && e.status === 'published');
    expect(validateUrls(published.filter((u) => u.includes('/it/'))).accepted).toHaveLength(it.length);
  });
});

describe('batching and payload', () => {
  it('splits 134 URLs into batches of at most 100 (100 + 34)', () => {
    const batches = chunk(publishedUrls());
    expect(batches.map((b) => b.length)).toEqual([100, 34]);
    expect(MAX_BATCH).toBeLessThanOrEqual(100);
  });
  it('payload follows the IndexNow JSON shape', () => {
    expect(buildPayload([TAJWEED])).toEqual({ host: 'al-rahmaacademy.com', key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_LOCATION, urlList: [TAJWEED] });
  });
});

describe('submit()', () => {
  it('POSTs JSON to the IndexNow endpoint, one request per batch, and reports statuses only', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const result = await submit(publishedUrls(), { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(init.body).urlList).toHaveLength(100);
    expect(result).toEqual({ ok: true, batches: [{ urls: 100, status: 200, ok: true }, { urls: 34, status: 200, ok: true }] });
  });

  it.each([[202], [400], [403], [422], [429]])('HTTP %i is reported, never thrown', async (status) => {
    const result = await submit([TAJWEED], { fetchImpl: async () => ({ status }) });
    expect(result.batches[0].status).toBe(status);
    expect(result.ok).toBe(status < 300);
  });

  it('a network failure does not throw', async () => {
    const result = await submit([TAJWEED], { fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    expect(result).toEqual({ ok: false, batches: [{ urls: 1, status: null, ok: false, error: 'network' }] });
  });

  it('a hung request times out instead of hanging', async () => {
    const fetchImpl = (_u, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const result = await submit([TAJWEED], { fetchImpl, timeoutMs: 20 });
    expect(result.batches[0]).toEqual({ urls: 1, status: null, ok: false, error: 'timeout' });
  });
});

describe('CLI', () => {
  const quiet = () => { const lines = []; return { lines, log: (l) => lines.push(l) }; };

  it('is a dry run by default: no network call, nothing sent', async () => {
    const fetchImpl = vi.fn();
    const { lines, log } = quiet();
    const code = await run(['--url', TAJWEED], { log, fetchImpl });
    expect(code).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('dry run');
  });

  it('sends only with --send', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const { log } = quiet();
    expect(await run(['--url', TAJWEED, '--send'], { log, fetchImpl })).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects the whole run when any URL is not allowed (nothing is sent)', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const { lines, log } = quiet();
    const code = await run(['--url', TAJWEED, '--url', 'https://al-rahmaacademy.com/es/', '--send'], { log, fetchImpl });
    expect(code).toBe(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('rejected https://al-rahmaacademy.com/es/');
  });

  it('refuses a full-site send (134 URLs) without --all', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const { lines, log } = quiet();
    const readFile = () => publishedUrls().join('\n');
    expect(await run(['--file', 'all.txt', '--send'], { log, fetchImpl, readFile })).toBe(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('without --all');
    expect(await run(['--file', 'all.txt', '--send', '--all'], { log, fetchImpl, readFile })).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reads one URL per line from a file, tolerating CRLF and blank lines', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const { log } = quiet();
    const readFile = () => `${TAJWEED}\r\n\r\nhttps://al-rahmaacademy.com/it/resources/faq\r\n`;
    expect(await run(['--file', 'x.txt', '--send'], { log, fetchImpl, readFile })).toBe(0);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).urlList).toHaveLength(2);
  });

  it('exits non-zero on a failed submission and with usage on no input', async () => {
    const { log } = quiet();
    expect(await run(['--url', TAJWEED, '--send'], { log, fetchImpl: async () => ({ status: 429 }) })).toBe(1);
    expect(await run([], { log })).toBe(2);
    expect(() => parseArgs(['--nope'])).toThrow();
  });

  it('never prints the key or its location', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const { lines, log } = quiet();
    await run(['--url', TAJWEED, '--send'], { log, fetchImpl });
    await run(['--url', 'https://example.com/', '--send'], { log, fetchImpl });
    expect(lines.join('\n')).not.toContain(INDEXNOW_KEY);
  });
});

describe('not part of build, prerender or CI', () => {
  it('no build script, prerender, workflow or runtime source mentions IndexNow', () => {
    const pkg = read(path.join(ROOT, 'package.json'));
    expect(pkg).not.toMatch(/indexnow/i);
    expect(read(path.join(ROOT, 'scripts/prerender.mjs'))).not.toMatch(/indexnow/i);
    expect(read(path.join(ROOT, 'scripts/gen-sitemap.mjs'))).not.toMatch(/indexnow/i);
    const wf = path.join(REPO, '.github/workflows');
    for (const f of fs.readdirSync(wf)) expect(read(path.join(wf, f)), f).not.toMatch(/indexnow/i);
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
    for (const f of walk(path.join(ROOT, 'src')).filter((p) => /\.(jsx?|tsx?)$/.test(p) && !p.includes(`${path.sep}test${path.sep}`))) {
      expect(read(f), f).not.toMatch(/indexnow/i);
    }
  });
});
