import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Guards two separate routing fixes for /api/v1/admin/*, read from the
 * real vercel.json rather than hardcoded, so an edit to the file itself
 * trips these assertions:
 *
 * 1. (original fix) /api/v1/admin/* must never be swallowed by the general
 *    /api/:path* -> Render external rewrite -- that was the bug where the
 *    Function was built and registered but had 0 invocations in production
 *    because the broad external rewrite matched admin paths first.
 *
 * 2. (this fix) /api/v1/admin/* must reach api/v1/admin-proxy.mjs at ANY
 *    depth, not just one path segment. Vercel's zero-config catch-all file
 *    convention (the old api/v1/admin/[...path].mjs) only matched requests
 *    with exactly one segment after the prefix in production --
 *    /api/v1/admin/enrollments worked, /api/v1/admin/auth/login (two
 *    segments, the actual login endpoint) got a platform 404 before the
 *    Function ever ran. A first attempt at fixing this with Vercel's named
 *    catch-all parameter syntax ("/api/v1/admin/:path*") reproduced the
 *    EXACT same one-segment-only limitation when verified live against a
 *    real Preview deployment -- so the fix uses a raw regex capture group
 *    instead ("^/api/v1/admin/?(.*)$" -> "/api/v1/admin-proxy?path=$1"),
 *    Vercel's other documented rewrite syntax (see the /articles/(\d{4})/...
 *    -> /archive?year=$1... example at
 *    https://vercel.com/docs/routing/rewrites), which is a structurally
 *    different code path in Vercel's router and was confirmed working for
 *    all 6 required paths live against a Preview deployment (see the PR
 *    description).
 */

const VERCEL_JSON_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'vercel.json'
);

function loadRewrites() {
  const config = JSON.parse(readFileSync(VERCEL_JSON_PATH, 'utf8'));
  return config.rewrites;
}

/**
 * Translates a path-to-regexp named-parameter-with-custom-regex source
 * (Vercel's documented syntax for excluding a sub-path from a rewrite,
 * e.g. "/api/:path((?!v1/admin(?:$|/)).*)") into the equivalent anchored
 * JS RegExp. This is a direct, literal translation of that one documented
 * form -- not a general path-to-regexp implementation -- so it only needs
 * to stay correct for the exact source string this rewrite uses.
 */
function compileNamedCustomRegexSource(source) {
  const match = source.match(/^(.*):[A-Za-z_$][A-Za-z0-9_$]*\((.*)\)$/);
  assert.ok(match, `expected a ":name(regex)" source, got: ${source}`);
  const [, literalPrefix, customRegex] = match;
  return new RegExp(`^${literalPrefix}(${customRegex})$`);
}

function findRenderExternalRewrite(rewrites) {
  const rule = rewrites.find((r) => r.destination.startsWith('https://academy-backend-cxso.onrender.com'));
  assert.ok(rule, 'expected a rewrite rule targeting the Render backend origin');
  return rule;
}

function findAdminProxyRewrite(rewrites) {
  const rule = rewrites.find((r) => r.source.includes('v1/admin') && r.destination.includes('admin-proxy'));
  assert.ok(rule, 'expected a dedicated /api/v1/admin/* rewrite rule targeting admin-proxy');
  return rule;
}

test('vercel.json declares exactly three rewrite rules (admin proxy, general Render, SPA)', () => {
  const rewrites = loadRewrites();
  assert.equal(rewrites.length, 3, 'rule count changed -- update this test deliberately if that was intended');
});

test('no rewrite rule is a literal circular self-rewrite (source and destination identical)', () => {
  const rewrites = loadRewrites();
  for (const rule of rewrites) {
    assert.notEqual(
      rule.destination,
      rule.source,
      `rewrite rule is a literal no-op self-rewrite: ${JSON.stringify(rule)}`
    );
  }
});

test('the admin proxy rewrite destination is a different, concrete path -- not /api/v1/admin/* again', () => {
  const rule = findAdminProxyRewrite(loadRewrites());
  // Exact-segment check, not a loose substring match: "/api/v1/admin-proxy"
  // contains the substring "v1/admin" too, but is a genuinely different
  // endpoint, not a loop back into the same dynamic path space.
  const destinationSegments = rule.destination.split('?')[0].split('/').filter(Boolean);
  assert.notDeepEqual(destinationSegments.slice(0, 3), ['api', 'v1', 'admin']);
});

test('the admin proxy rewrite source/destination are exactly the documented regex-capture form', () => {
  const rule = findAdminProxyRewrite(loadRewrites());
  assert.equal(rule.source, '^/api/v1/admin(/.*|)$');
  assert.equal(rule.destination, '/api/v1/admin-proxy?path=$1');
});

test('the admin proxy rewrite source regex matches every required admin path, at any depth', () => {
  // Uses the rule's own source string directly as a RegExp -- this form is
  // already a plain, anchored JS-compatible regex (no path-to-regexp
  // named-parameter translation needed), per Vercel's own documented
  // regex-capture rewrite syntax.
  const rule = findAdminProxyRewrite(loadRewrites());
  const matcher = new RegExp(rule.source);

  const requiredPaths = [
    '/api/v1/admin', // zero segments -- the trailing "/?" makes this match too
    '/api/v1/admin/enrollments',
    '/api/v1/admin/auth',
    '/api/v1/admin/auth/login',
    '/api/v1/admin/auth/refresh',
    '/api/v1/admin/auth/logout',
    '/api/v1/admin/teachers/123',
  ];
  for (const p of requiredPaths) {
    assert.equal(matcher.test(p), true, `expected the admin proxy rewrite to match ${p}`);
  }
});

test('the admin proxy rewrite source regex does not match an unrelated path that merely starts similarly', () => {
  const rule = findAdminProxyRewrite(loadRewrites());
  const matcher = new RegExp(rule.source);
  assert.equal(matcher.test('/api/v1/adminfoo'), false);
  assert.equal(matcher.test('/api/healthz'), false);
  assert.equal(matcher.test('/api/courses'), false);
});

test('the general external rewrite to Render excludes /api/v1/admin and /api/v1/admin/*', () => {
  const rule = findRenderExternalRewrite(loadRewrites());
  const matcher = compileNamedCustomRegexSource(rule.source);

  assert.equal(matcher.test('/api/v1/admin'), false, '/api/v1/admin must not match the external rewrite');
  assert.equal(matcher.test('/api/v1/admin/'), false);
  assert.equal(matcher.test('/api/v1/admin/enrollments'), false);
  assert.equal(matcher.test('/api/v1/admin/enrollments/abc-123'), false);
  assert.equal(matcher.test('/api/v1/admin/deeply/nested/path'), false);
});

test('the general external rewrite to Render still matches every non-admin /api/* path', () => {
  const rule = findRenderExternalRewrite(loadRewrites());
  const matcher = compileNamedCustomRegexSource(rule.source);

  assert.equal(matcher.test('/api/healthz'), true);
  assert.equal(matcher.test('/api/courses'), true);
  assert.equal(matcher.test('/api/auth/me'), true);
  assert.equal(matcher.test('/api/v1/enrollments'), true);
});

test('the external rewrite exclusion is prefix-exact, not a loose substring match', () => {
  // Regression guard: paths that merely start with "v1/admin" as a
  // substring of a *different* segment must still be proxied to Render --
  // only the literal /api/v1/admin (and its sub-paths) are excluded.
  const rule = findRenderExternalRewrite(loadRewrites());
  const matcher = compileNamedCustomRegexSource(rule.source);

  assert.equal(matcher.test('/api/v1/adminfoo'), true);
  assert.equal(matcher.test('/api/v1/administrator/x'), true);
});

test('the Render destination host/path template is unchanged by this fix', () => {
  const rule = findRenderExternalRewrite(loadRewrites());
  assert.equal(rule.destination.startsWith('https://academy-backend-cxso.onrender.com/api/'), true);
});

test('the SPA catch-all rewrite is untouched', () => {
  const rewrites = loadRewrites();
  const spaRule = rewrites.find((r) => r.destination === '/index.html');
  assert.ok(spaRule, 'expected the SPA fallback rewrite to still exist');
  assert.equal(spaRule.source, '/((?!api/|.*\\..*).*)');
});
