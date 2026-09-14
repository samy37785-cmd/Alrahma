import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '../utils/adminAuthTokens.js';
import { SUPABASE_AT_COOKIE, supabaseAtCookieOptions } from '../data/supabase/supabaseSessionCookie.js';

// Review follow-up: the admin logout fix (data/supabase/adminAuthController.js)
// only means anything if the cookie it relies on (admin_sat) actually
// reaches POST /api/v1/admin/auth/logout in a real browser. A "logical"
// mock that hand-constructs req.cookies with whatever the test author
// assumes should be present cannot catch this class of bug — it was
// exactly this Path-scoping fact, invisible to a mock, that let the
// original bug ship. This test proves it against real HTTP-cookie
// semantics instead: the actual cookie-option functions from production
// code (accessCookieOptions/refreshCookieOptions/supabaseAtCookieOptions),
// a real express + cookie-parser server, and supertest's agent — which
// wraps superagent's cookiejar and DOES honor the Path attribute when
// deciding whether to resend a cookie on a later request, the same as any
// standards-compliant browser.
//
// Second review follow-up (logout must survive an expired admin_at):
// admin_rt's Path was subsequently WIDENED from /api/v1/admin/auth/refresh
// to /api/v1/admin/auth (utils/adminAuthTokens.js's refreshCookieOptions),
// specifically so it reaches /logout too — this is what lets the Mongo
// backend's logout() (controllers/adminAuthController.js) revoke a session
// via admin_rt alone even when admin_at has already expired. This file now
// proves the new contract (admin_rt DOES reach /logout) instead of the old
// one, and adds a companion check that the widened Path still stops at the
// /auth subtree — it must never reach a sibling route like /users.
function buildCookiePathProbeApp() {
  const app = express();
  app.use(cookieParser());

  app.get('/set', (req, res) => {
    res.cookie(ACCESS_TOKEN_COOKIE, 'AT_VALUE', accessCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE, 'RT_VALUE', refreshCookieOptions());
    res.cookie(SUPABASE_AT_COOKIE, 'SAT_VALUE', supabaseAtCookieOptions());
    res.end();
  });

  // Mirrors the real route paths exactly (not just their leaf segment) —
  // Path-scoping is evaluated against the full request path. /users stands
  // in for any sibling admin route outside the /auth subtree.
  const admin = express.Router();
  admin.post('/auth/logout', (req, res) => res.json({ cookies: req.cookies }));
  admin.post('/auth/refresh', (req, res) => res.json({ cookies: req.cookies }));
  admin.get('/users', (req, res) => res.json({ cookies: req.cookies }));
  app.use('/api/v1/admin', admin);

  return app;
}

test('admin_sat and admin_rt both reach POST /api/v1/admin/auth/logout (real cookie-jar Path semantics, not a hand-built mock)', async () => {
  const app = buildCookiePathProbeApp();
  const agent = request.agent(app);

  await agent.get('/set');

  const logoutReq = await agent.post('/api/v1/admin/auth/logout').send();
  assert.equal(
    logoutReq.body.cookies[SUPABASE_AT_COOKIE],
    'SAT_VALUE',
    'admin_sat (Path=/api/v1/admin) must reach /logout — this is what the GoTrue-revocation call relies on',
  );
  assert.equal(
    logoutReq.body.cookies[REFRESH_TOKEN_COOKIE],
    'RT_VALUE',
    'admin_rt (Path=/api/v1/admin/auth, widened from /auth/refresh only) must now reach /logout — this is ' +
      'what lets the Mongo backend revoke a session via admin_rt alone even when admin_at has expired',
  );

  const refreshReq = await agent.post('/api/v1/admin/auth/refresh').send();
  assert.equal(refreshReq.body.cookies[REFRESH_TOKEN_COOKIE], 'RT_VALUE');
  assert.equal(refreshReq.body.cookies[ACCESS_TOKEN_COOKIE], 'AT_VALUE');
});

test('admin_rt still does NOT reach a sibling admin route outside the /auth subtree — the widened Path is /api/v1/admin/auth, not the whole admin API', async () => {
  const app = buildCookiePathProbeApp();
  const agent = request.agent(app);

  await agent.get('/set');

  const usersReq = await agent.get('/api/v1/admin/users').send();
  assert.equal(
    usersReq.body.cookies[REFRESH_TOKEN_COOKIE],
    undefined,
    'admin_rt must stay scoped to /api/v1/admin/auth — it must never reach an unrelated admin route',
  );
  assert.equal(
    usersReq.body.cookies[ACCESS_TOKEN_COOKIE],
    'AT_VALUE',
    'sanity: admin_at (Path=/api/v1/admin) is intentionally wider and does reach every admin route',
  );
});
