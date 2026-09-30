import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Guards the routing fix that lets /api/v1/admin/* reach the Vercel
 * Function api/v1/admin/[...path].mjs instead of being swallowed by the
 * general /api/:path* -> Render external rewrite (which is exactly what
 * happened before this fix: the Function was built and registered but had
 * 0 invocations in production because the broad external rewrite matched
 * admin paths first).
 *
 * Reads the real vercel.json rather than hardcoding its contents, so an
 * edit to the file itself trips these assertions.
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

test('vercel.json still declares exactly two rewrite rules (no new rule was added)', () => {
  const rewrites = loadRewrites();
  assert.equal(rewrites.length, 2, 'a third rewrite rule appeared -- check it is not a circular /api/v1/admin self-rewrite');
});

test('no rewrite rule is a circular self-rewrite of /api/v1/admin back to itself', () => {
  const rewrites = loadRewrites();
  for (const rule of rewrites) {
    const sourceTargetsAdmin = rule.source.includes('v1/admin') || rule.source.includes('v1%2Fadmin');
    const destinationTargetsAdminSamePath =
      !rule.destination.startsWith('http') && rule.destination.includes('v1/admin');
    assert.ok(
      !(sourceTargetsAdmin && destinationTargetsAdminSamePath),
      `rewrite rule looks like a circular /api/v1/admin self-rewrite: ${JSON.stringify(rule)}`
    );
  }
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
