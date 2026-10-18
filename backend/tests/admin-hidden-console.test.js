import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  ADMIN_GATE_COOKIE, NOT_FOUND_PATH, GATE_COOKIE_MAX_AGE, MIN_KEY_LENGTH,
  decidePage, adminPageResponse, gateCookieValue, isHiddenPage,
} from '../../api/_lib/adminGate.mjs';
import middleware, { config as middlewareConfig } from '../../middleware.js';
import proxyHandler from '../../api/v1/admin-proxy.mjs';

// The hidden admin console (api/_lib/adminGate.mjs, /middleware.js and the
// gate in api/v1/admin-proxy.mjs). These live at the repo root for Vercel;
// they are tested here so CI runs them with the backend suite.
//
// With ADMIN_PAGE_KEY set, the admin pages and the admin API through the
// site's domain look like routes that do not exist, unless the browser has
// opened the secret link /admin-access/<key>. Without the key nothing
// changes. No network: fetch is replaced in the proxy tests.

const KEY = 'k'.repeat(16) + '0123456789abcdef0123456789abcdef'; // 48 chars
const OTHER_KEY = 'z'.repeat(48);
const SITE = 'https://al-rahmaacademy.com';

const HIDDEN_PAGES = ['/admin', '/admin/', '/admin/login', '/admin/login/', '/ar/admin', '/ar/admin/login', '/fr/admin/login', '/de/admin'];
const OPEN_PAGES = ['/', '/login', '/dashboard', '/administration', '/admins', '/ar/login', '/tools/quran-reader', '/academy/teachers'];

const page = (path, cookie) => new Request(`${SITE}${path}`, cookie ? { headers: { cookie } } : undefined);
const kind = (res) => {
  if (res.headers.get('x-middleware-next') === '1') return 'next';
  if (res.headers.get('x-middleware-rewrite')) return `rewrite:${new URL(res.headers.get('x-middleware-rewrite')).pathname}`;
  return `status:${res.status}`;
};
const goodCookie = async (key = KEY) => `${ADMIN_GATE_COOKIE}=${await gateCookieValue(key)}`;

afterEach(() => { delete process.env.ADMIN_PAGE_KEY; });

// ── Off until the key is set ───────────────────────────────────────────────

test('without ADMIN_PAGE_KEY (or with one that is too short) nothing is hidden', async () => {
  for (const key of [undefined, '', 'x'.repeat(MIN_KEY_LENGTH - 1)]) {
    for (const path of [...HIDDEN_PAGES, '/admin-access/anything']) {
      assert.equal(kind(await adminPageResponse(page(path), key)), 'next', `${path} with key ${key?.length}`);
    }
  }
});

// ── Pages ──────────────────────────────────────────────────────────────────

test('with the key set, every admin page answers like a missing page without the cookie', async () => {
  for (const path of HIDDEN_PAGES) {
    assert.equal(kind(await adminPageResponse(page(path), KEY)), `rewrite:${NOT_FOUND_PATH}`, path);
  }
});

test('a wrong, empty or old-key cookie does not open the pages', async () => {
  for (const cookie of [`${ADMIN_GATE_COOKIE}=nope`, `${ADMIN_GATE_COOKIE}=`, await goodCookie(OTHER_KEY), `other=${await gateCookieValue(KEY)}`, `${ADMIN_GATE_COOKIE}=${KEY}`]) {
    assert.equal(kind(await adminPageResponse(page('/admin/login', cookie), KEY)), `rewrite:${NOT_FOUND_PATH}`, cookie);
  }
});

test('the right cookie opens the admin pages, among other cookies too', async () => {
  const cookie = `csrf_token=abc; ${await goodCookie()}; theme=dark`;
  for (const path of HIDDEN_PAGES) {
    assert.equal(kind(await adminPageResponse(page(path, cookie), KEY)), 'next', path);
  }
});

test('the rest of the site is never touched by the gate', async () => {
  for (const path of OPEN_PAGES) {
    assert.equal(isHiddenPage(path), false, path);
    assert.deepEqual(await decidePage({ pathname: path, cookieHeader: '', key: KEY }), { action: 'pass' }, path);
  }
});

// ── The secret link ────────────────────────────────────────────────────────

test('the secret link sets the cookie and goes to the login page', async () => {
  const res = await adminPageResponse(page(`/admin-access/${KEY}`), KEY);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/admin/login');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie.startsWith(`${ADMIN_GATE_COOKIE}=${await gateCookieValue(KEY)};`));
  for (const attr of ['Path=/', `Max-Age=${GATE_COOKIE_MAX_AGE}`, 'HttpOnly', 'Secure', 'SameSite=Lax']) {
    assert.ok(setCookie.includes(attr), attr);
  }
  assert.ok(!setCookie.includes(KEY), 'the cookie never holds the key itself');

  // A trailing slash works too.
  assert.equal((await adminPageResponse(page(`/admin-access/${KEY}/`), KEY)).status, 302);
});

test('a wrong secret link answers like a missing page and sets nothing', async () => {
  const wrong = [
    '/admin-access/', '/admin-access/x', `/admin-access/${KEY.slice(0, -1)}`, `/admin-access/${KEY}x`,
    `/admin-access/${OTHER_KEY}`, `/admin-access/${KEY}/extra`, '/admin-access/%E0%A4%A',
  ];
  for (const path of wrong) {
    const res = await adminPageResponse(page(path), KEY);
    assert.equal(kind(res), `rewrite:${NOT_FOUND_PATH}`, path);
    assert.equal(res.headers.get('set-cookie'), null, path);
  }
});

test('changing the key signs every browser out of the hidden console', async () => {
  const oldCookie = await goodCookie(KEY);
  assert.equal(kind(await adminPageResponse(page('/admin/login', oldCookie), OTHER_KEY)), `rewrite:${NOT_FOUND_PATH}`);
  assert.equal(kind(await adminPageResponse(page('/admin/login', await goodCookie(OTHER_KEY)), OTHER_KEY)), 'next');
});

// ── The middleware file Vercel runs ────────────────────────────────────────

test('middleware.js reads ADMIN_PAGE_KEY and runs only on the admin pages and the secret link', async () => {
  process.env.ADMIN_PAGE_KEY = KEY;
  assert.equal(kind(await middleware(page('/admin/login'))), `rewrite:${NOT_FOUND_PATH}`);
  assert.equal((await middleware(page(`/admin-access/${KEY}`))).status, 302);
  delete process.env.ADMIN_PAGE_KEY;
  assert.equal(kind(await middleware(page('/admin/login'))), 'next');

  assert.deepEqual(middlewareConfig.matcher, [
    '/admin', '/admin/:path*',
    '/:lang(ar|fr|it|es|de)/admin', '/:lang(ar|fr|it|es|de)/admin/:path*',
    '/admin-access/:path*',
  ]);
});

// ── The admin API through the site's domain (signed proxy) ─────────────────

function proxyRequest(url, cookie) {
  const stream = Readable.from([]);
  stream.url = url;
  stream.method = 'GET';
  stream.headers = cookie ? { cookie } : {};
  return stream;
}

function proxyResponse() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = b === undefined ? null : String(b); };
  return res;
}

function stubFetch() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('with the key set, the admin API answers "route not found" without the cookie and never reaches the backend', async () => {
  process.env.ADMIN_PAGE_KEY = KEY;
  const fetchStub = stubFetch();
  try {
    for (const cookie of [undefined, `${ADMIN_GATE_COOKIE}=nope`, await goodCookie(OTHER_KEY)]) {
      const res = proxyResponse();
      await proxyHandler(proxyRequest('/api/v1/admin-proxy?path=users&subpath=users', cookie), res);
      assert.equal(res.statusCode, 404);
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
      assert.deepEqual(JSON.parse(res.body), { message: 'Route not found: /api/v1/admin/users' });
    }
    // Even a request the proxy would reject as malformed looks missing.
    const odd = proxyResponse();
    await proxyHandler(proxyRequest('/api/v1/admin-proxy?path=a&subpath=b'), odd);
    assert.equal(odd.statusCode, 404);
    assert.equal(fetchStub.calls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

test('with the right cookie (or no key at all) the admin API is forwarded as before', async () => {
  const fetchStub = stubFetch();
  try {
    process.env.ADMIN_PAGE_KEY = KEY;
    const withCookie = proxyResponse();
    await proxyHandler(proxyRequest('/api/v1/admin-proxy?path=users&subpath=users', await goodCookie()), withCookie);
    assert.equal(withCookie.statusCode, 200);

    delete process.env.ADMIN_PAGE_KEY;
    const noKey = proxyResponse();
    await proxyHandler(proxyRequest('/api/v1/admin-proxy?path=users&subpath=users'), noKey);
    assert.equal(noKey.statusCode, 200);

    assert.equal(fetchStub.calls.length, 2);
    assert.ok(fetchStub.calls.every((u) => u.endsWith('/api/v1/admin/users')));
  } finally {
    fetchStub.restore();
  }
});
