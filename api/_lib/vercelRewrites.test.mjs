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
 *    Function ever ran.
 *
 *    Three attempts at fixing this were tried; the first two were each
 *    verified live against a real Preview deployment and found NOT to
 *    work, despite each being Vercel's own documented syntax and matching
 *    correctly as a plain JS RegExp locally:
 *      - Named catch-all parameter: "/api/v1/admin/:path*" ->
 *        "/api/v1/admin-proxy" -- reproduced the exact one-segment-only
 *        limitation this fix is for.
 *      - A bare regex capture group with an anchored "^...$" source:
 *        "^/api/v1/admin/(.*)$" -> "/api/v1/admin-proxy?path=$1" -- matched
 *        NOTHING at all on Vercel's actual edge, not even one segment.
 *    The working fix uses the ONE syntax form already proven correct in
 *    this exact project for multi-segment matching: a named parameter
 *    with an attached custom regex group, ":name(regex)" -- the same
 *    family the general Render rewrite below already uses
 *    (":path((?!v1/admin(?:$|/)).*)"), which has successfully forwarded
 *    arbitrarily deep non-admin paths to Render all along. One exact-literal
 *    rule covers the bare /api/v1/admin case; ":subpath(.*)" covers
 *    everything with a subpath, with the match reused as a NAMED
 *    destination parameter (":subpath", not a numbered "$1" backreference).
 *    Confirmed working for all 6 required paths live against a Preview
 *    deployment (see the PR description).
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

function findAdminBareRewrite(rewrites) {
  const rule = rewrites.find((r) => r.source === '/api/v1/admin');
  assert.ok(rule, 'expected an exact-literal rewrite rule for the bare /api/v1/admin path');
  return rule;
}

function findAdminSubpathRewrite(rewrites) {
  const rule = rewrites.find((r) => r.source.startsWith('/api/v1/admin/:subpath'));
  assert.ok(rule, 'expected a named-parameter rewrite rule for /api/v1/admin/<subpath>');
  return rule;
}

test('vercel.json declares exactly four rewrite rules (admin bare, admin subpath, general Render, SPA)', () => {
  const rewrites = loadRewrites();
  assert.equal(rewrites.length, 4, 'rule count changed -- update this test deliberately if that was intended');
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

test('both admin rewrite destinations are a different, concrete path -- not /api/v1/admin/* again', () => {
  const rewrites = loadRewrites();
  for (const rule of [findAdminBareRewrite(rewrites), findAdminSubpathRewrite(rewrites)]) {
    // Exact-segment check, not a loose substring match: "/api/v1/admin-proxy"
    // contains the substring "v1/admin" too, but is a genuinely different
    // endpoint, not a loop back into the same dynamic path space.
    const destinationSegments = rule.destination.split('?')[0].split('/').filter(Boolean);
    assert.notDeepEqual(destinationSegments.slice(0, 3), ['api', 'v1', 'admin']);
  }
});

test('the admin rewrite rules are exactly the working, verified form (named parameter, not $-backreference)', () => {
  const rewrites = loadRewrites();
  assert.equal(findAdminBareRewrite(rewrites).destination, '/api/v1/admin-proxy');
  const subpathRule = findAdminSubpathRewrite(rewrites);
  assert.equal(subpathRule.source, '/api/v1/admin/:subpath(.*)');
  assert.equal(subpathRule.destination, '/api/v1/admin-proxy?path=:subpath');
});

test('the two admin rewrite rules together match every required admin path, at any depth', () => {
  // The subpath rule reuses compileNamedCustomRegexSource() -- the exact
  // same translation already relied on below for the general Render
  // rewrite's own ":path(regex)" source -- rather than a second,
  // independent implementation, since both rules are the same syntax
  // family. Mirrors how Vercel evaluates rewrites: a request matches if
  // EITHER rule's source matches it.
  const rewrites = loadRewrites();
  const bareSource = findAdminBareRewrite(rewrites).source;
  const subpathMatcher = compileNamedCustomRegexSource(findAdminSubpathRewrite(rewrites).source);

  const requiredPaths = [
    '/api/v1/admin', // zero segments -- covered by the bare exact-literal rule
    '/api/v1/admin/enrollments',
    '/api/v1/admin/auth',
    '/api/v1/admin/auth/login',
    '/api/v1/admin/auth/refresh',
    '/api/v1/admin/auth/logout',
    '/api/v1/admin/teachers/123',
  ];
  for (const p of requiredPaths) {
    const matched = p === bareSource || subpathMatcher.test(p);
    assert.equal(matched, true, `expected an admin rewrite rule to match ${p}`);
  }
});

test('the admin subpath rewrite does not match an unrelated path that merely starts similarly', () => {
  const rule = findAdminSubpathRewrite(loadRewrites());
  const matcher = compileNamedCustomRegexSource(rule.source);
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
