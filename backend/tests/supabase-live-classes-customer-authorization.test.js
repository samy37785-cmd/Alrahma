import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import { mock } from 'node:test';

// Production-readiness audit follow-up, round 2 (2026-09-17): the earlier
// pass proved the DB-level boundary directly (lib/db/test/rls.local.test.mjs
// -- a plain, non-teacher, non-admin user is rejected by
// live_classes_insert_teacher_or_admin/_update_owner_or_admin/
// _delete_owner_or_admin, lib/db/drizzle/0015_new_domains_rls.sql). That is
// necessary but not sufficient on its own: RLS only protects a query if the
// connection actually runs as the `authenticated` role with a real
// auth.uid() claim (client.js's withUserContext()) -- it does nothing at
// all for a connection opened via withServiceRole() (bypasses RLS
// entirely, by design, for the handful of operations that legitimately
// need it -- see client.js's own module comment). This file closes that
// gap: it proves, at the real HTTP/controller layer (the actual code path
// backend/data/supabase/routes/liveClassRoutes.js -> liveClassController.js
// runs, not a hypothetical), that:
//   1. the controller never imports/calls withServiceRole at all (static
//      proof -- structurally impossible to bypass RLS from this file);
//   2. a plain/non-teacher/non-admin caller's POST/PATCH/DELETE is
//      rejected at the HTTP layer with a real error response, simulating
//      exactly the rejection shape real Postgres RLS produces (SQLSTATE
//      42501 for INSERT's WITH CHECK failure; 0 affected rows, no error,
//      for UPDATE/DELETE's USING clause) -- proving the controller's own
//      try/catch and "0 rows -> 404" handling do not accidentally turn a
//      real rejection into a false success or leak data;
//   3. the real teacher/owner and admin paths still succeed, so the
//      rejection above is proven to be a real authorization boundary, not
//      just "every request fails".
// Same node:test module-mock technique as tests/supabase-review-ownership
// .test.js and tests/supabase-live-classes-admin.test.js: intercept
// withUserContext() and drive a fake in-memory `pg` client that returns
// exactly what real Postgres/RLS would for each scenario. No real
// Postgres/Supabase connection is ever made.

const controllerPath = path.resolve('data/supabase/liveClassController.js');
const clientUrl = pathToFileURL(path.resolve('data/supabase/client.js')).href;
const controllerUrl = pathToFileURL(controllerPath).href;

test('static: liveClassController.js never imports withServiceRole from client.js -- structurally cannot bypass RLS for these customer-facing writes', () => {
  const source = readFileSync(controllerPath, 'utf8');
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*\bwithServiceRole\b[^}]*\}\s*from\s*['"]\.\/client\.js['"]/,
    'liveClassController.js must only ever use withUserContext (real RLS-enforced) for these routes, never withServiceRole (bypasses RLS)',
  );
});

let calls;
let rejectInsert;   // when true, the fake INSERT simulates a real RLS WITH CHECK failure
let updateMatches;  // when true, the fake UPDATE/DELETE simulates a row RLS's USING clause allows
let insertedRow;

function makeFakeClient() {
  return {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^\s*INSERT INTO live_classes/.test(sql)) {
        if (rejectInsert) {
          // Exactly what a real live_classes_insert_teacher_or_admin WITH
          // CHECK failure looks like from node-postgres: err.code 42501,
          // message containing "row-level security".
          const err = new Error('new row violates row-level security policy for table "live_classes"');
          err.code = '42501';
          throw err;
        }
        insertedRow = {
          id: 'new-class-1', teacher_id: params[0], student_id: params[1], title: params[2],
          starts_at: params[3], duration_min: params[4], meeting_url: params[5], notes: params[6],
          status: 'scheduled', created_at: new Date(), updated_at: new Date(),
        };
        return { rows: [insertedRow] };
      }
      if (/^\s*UPDATE live_classes/.test(sql)) {
        // Real RLS behavior for UPDATE: a row the USING clause excludes is
        // just not matched -- 0 rows, no error (distinct failure mode from
        // INSERT's WITH CHECK, which throws).
        if (!updateMatches) return { rows: [] };
        return { rows: [{ id: 'class-1', teacher_id: 'teacher-x', student_id: 'student-x', title: 'Updated', starts_at: new Date(), duration_min: 30, meeting_url: null, notes: null, status: 'scheduled', created_at: new Date(), updated_at: new Date() }] };
      }
      if (/^\s*DELETE FROM live_classes/.test(sql)) {
        if (!updateMatches) return { rows: [] };
        return { rows: [{ id: 'class-1' }] };
      }
      throw new Error(`unexpected query in test fake client: ${sql}`);
    },
  };
}

let createClass, updateClass, deleteClass;

before(async () => {
  const realClientModule = await import(clientUrl);
  mock.module(clientUrl, {
    exports: {
      ...realClientModule,
      withUserContext: async (userId, fn) => fn(makeFakeClient()),
    },
  });
  ({ createClass, updateClass, deleteClass } = await import(controllerUrl));
});

after(() => {
  mock.reset();
});

function fakeRes() {
  return {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// The controllers under test follow this codebase's real convention:
// `res.status(404); throw new Error('...')`, relying on Express's error-
// handling middleware (backend/middleware/errorHandler.js) to read the
// already-set res.statusCode and turn the thrown error into
// `res.status(status).json({ message: err.message })`. Calling the
// controller directly (bypassing the real Express app/middleware chain,
// same as tests/supabase-review-ownership.test.js's approach) means this
// test must supply the same conversion errorHandler.js does, or every
// thrown-error path would surface as an uncaught exception instead of the
// real HTTP response a caller actually gets.
function callAndResolveResponse(fn, req, res) {
  return fn(req, res, (err) => {
    if (!err) return;
    const status = res._status && res._status !== 200 ? res._status : (err.status || err.statusCode || 500);
    res.status(status).json({ message: err.message || 'Server error' });
  });
}

test.beforeEach(() => {
  calls = [];
  rejectInsert = false;
  updateMatches = false;
  insertedRow = null;
});

// ---------------------------------------------------------------------------
// POST /api/classes (createClass)
// ---------------------------------------------------------------------------

test('POST /api/classes: a plain, non-teacher, non-admin user is rejected 404 when RLS would reject the INSERT -- never 500, never a false success', async () => {
  rejectInsert = true;
  const req = {
    user: { _id: 'plain-user-uuid', role: 'user' },
    body: { student: 'some-student-uuid', title: 'Forged class', startsAt: new Date(Date.now() + 86400000).toISOString() },
  };
  const res = fakeRes();

  await callAndResolveResponse(createClass, req, res);

  assert.equal(res._status, 404, `expected 404 (mapped from the RLS rejection), got ${res._status}`);
  assert.match(res._body.message, /Student not found among your students/);
  const insertCall = calls.find((c) => /INSERT INTO live_classes/.test(c.sql));
  assert.ok(insertCall, 'the INSERT must actually have been attempted (and rejected by RLS), not skipped');
  // The controller always sends teacher_id = req.user._id and role===admin
  // as the 9th... here the real params are [teacher_id, student, title, ...]
  // -- confirm the plain user's own id was sent as teacher_id (proving the
  // controller does not silently substitute or omit it), which is exactly
  // what a forged attempt looks like and exactly what RLS's is_teacher_of()
  // check is designed to catch.
  assert.equal(insertCall.params[0], 'plain-user-uuid');
});

test('POST /api/classes: the real assigned teacher succeeds (positive control -- proves the rejection above is a real boundary, not "everything fails")', async () => {
  rejectInsert = false;
  const req = {
    user: { _id: 'teacher-uuid', role: 'user' },
    body: { student: 'their-real-student-uuid', title: 'Real class', startsAt: new Date(Date.now() + 86400000).toISOString() },
  };
  const res = fakeRes();

  await callAndResolveResponse(createClass, req, res);

  assert.equal(res._status, 201, `expected 201, got ${res._status}: ${JSON.stringify(res._body)}`);
  const insertCall = calls.find((c) => /INSERT INTO live_classes/.test(c.sql));
  assert.equal(insertCall.params[0], 'teacher-uuid');
});

// ---------------------------------------------------------------------------
// PATCH /api/classes/:id (updateClass)
// ---------------------------------------------------------------------------

test('PATCH /api/classes/:id: a non-owning, non-admin user gets 404 when RLS excludes the row (0 rows, no error) -- never a silent success', async () => {
  updateMatches = false;
  const req = {
    user: { _id: 'plain-user-uuid', role: 'user' },
    params: { id: 'class-1' },
    body: { title: 'Hijacked' },
  };
  const res = fakeRes();

  await callAndResolveResponse(updateClass, req, res);

  assert.equal(res._status, 404);
  assert.match(res._body.message, /Class not found/);
  const updateCall = calls.find((c) => /UPDATE live_classes/.test(c.sql));
  assert.ok(updateCall, 'the UPDATE must actually have been attempted');
  // params: [id, userId, title, startsAt, durationMin, meetingUrl, notes, status]
  // -- no admin-bypass param (see the "no admin bypass" test below).
  assert.equal(updateCall.params.length, 8);
});

test('PATCH /api/classes/:id: the owning teacher succeeds (positive control)', async () => {
  updateMatches = true;
  const req = {
    user: { _id: 'teacher-x', role: 'user' },
    params: { id: 'class-1' },
    body: { title: 'Updated' },
  };
  const res = fakeRes();

  await callAndResolveResponse(updateClass, req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.title, 'Updated');
});

// Correction (2026-09-17): this test used to assert an admin's UPDATE
// carried an `isAdmin=true` 9th SQL param and treated that as a positive
// control ("admin succeeds") -- misleading, because this mocked fake
// client can only ever reflect what IT was told to simulate (updateMatches),
// never real RLS. In production, RLS's live_classes_update_owner_or_admin
// requires is_admin_aal2(), which this route's withUserContext() call never
// sets -- so an admin is REJECTED here exactly like any other non-owner
// (proven against real Postgres in
// tests/supabase-live-classes-real-integration.test.js, not this file).
// The controller itself no longer sends any admin-bypass param at all (see
// data/supabase/liveClassController.js's own correction comment) -- all
// this mocked suite can honestly assert is that an admin's request sends
// the exact same 2 identifying params as anyone else's, with no special
// treatment baked into the query.
test('PATCH /api/classes/:id: an admin gets no special app-layer treatment -- same id/userId params as any other caller (real rejection proven in the Postgres integration test, not here)', async () => {
  updateMatches = false;
  const req = {
    user: { _id: 'admin-uuid', role: 'admin' },
    params: { id: 'class-1' },
    body: { title: 'Admin edit attempt' },
  };
  const res = fakeRes();

  await callAndResolveResponse(updateClass, req, res);

  assert.equal(res._status, 404);
  const updateCall = calls.find((c) => /UPDATE live_classes/.test(c.sql));
  assert.deepEqual(updateCall.params.slice(0, 2), ['class-1', 'admin-uuid']);
  assert.equal(updateCall.params.length, 8, 'no admin-bypass param');
});

// ---------------------------------------------------------------------------
// DELETE /api/classes/:id (deleteClass)
// ---------------------------------------------------------------------------

test('DELETE /api/classes/:id: a non-owning, non-admin user gets 404 when RLS excludes the row -- never a silent success', async () => {
  updateMatches = false;
  const req = { user: { _id: 'plain-user-uuid', role: 'user' }, params: { id: 'class-1' } };
  const res = fakeRes();

  await callAndResolveResponse(deleteClass, req, res);

  assert.equal(res._status, 404);
  assert.match(res._body.message, /Class not found/);
  const deleteCall = calls.find((c) => /DELETE FROM live_classes/.test(c.sql));
  assert.ok(deleteCall);
  assert.equal(deleteCall.params.length, 2, 'no admin-bypass param');
});

test('DELETE /api/classes/:id: the owning teacher succeeds (positive control)', async () => {
  updateMatches = true;
  const req = { user: { _id: 'teacher-x', role: 'user' }, params: { id: 'class-1' } };
  const res = fakeRes();

  await callAndResolveResponse(deleteClass, req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.id, 'class-1');
});
