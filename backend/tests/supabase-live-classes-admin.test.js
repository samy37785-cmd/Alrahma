import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { mock } from 'node:test';

// Review follow-up: data/supabase/admin/liveClassesAdminController.js had
// two real bugs, not just an envelope-shape mismatch:
//   1. `create()` required `teacher` in the request body and would 400 (or
//      hit a DB NOT NULL violation) on the one real frontend caller,
//      AdminClassesTab.jsx/classApi.js's createClass(), which never sends
//      a `teacher` field at all -- an admin-scheduled class has no
//      regular-user teacher identity, matching the Mongo-mode contract.
//   2. `list()` silently ignored ?upcoming=1 entirely (the Mongo-mode
//      controller supports it), and even if it had applied the filter to
//      just the data query, that would have left `total`/`pages` lying
//      about how many rows actually matched.
//
// Both are fixed by editing the actual SQL this controller builds -- so
// this file proves it by intercepting withUserContext() (via node:test's
// experimental module-mock support; see backend/package.json's `test`
// script for the --experimental-test-module-mocks flag this requires) and
// inspecting the REAL query text/params the controller constructs, against
// a fake in-memory `pg` client. No real Postgres/Supabase connection is
// ever made.
const clientUrl = pathToFileURL(path.resolve('data/supabase/client.js')).href;
const controllerUrl = pathToFileURL(
  path.resolve('data/supabase/admin/liveClassesAdminController.js'),
).href;
const auditLogUrl = pathToFileURL(path.resolve('data/supabase/adminAuditLog.js')).href;

let calls;
let nextInsertRow;

function makeFakeClient() {
  return {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^\s*INSERT INTO live_classes/.test(sql)) {
        return { rows: [nextInsertRow] };
      }
      if (/^\s*SELECT \* FROM live_classes/.test(sql)) {
        return { rows: [] };
      }
      if (/count\(\*\)/.test(sql)) {
        return { rows: [{ n: 0 }] };
      }
      return { rows: [] };
    },
  };
}

let list;
let create;

before(async () => {
  const realClientModule = await import(clientUrl);
  mock.module(clientUrl, {
    exports: {
      ...realClientModule,
      withUserContext: async (userId, fn) => fn(makeFakeClient()),
    },
  });
  // adminAuditLog.js's auditAdminAction() also goes through client.js's
  // withServiceRole -- real, unrelated to what this file tests, and would
  // otherwise try to open a real Postgres connection during create().
  const realAuditLogModule = await import(auditLogUrl);
  mock.module(auditLogUrl, {
    exports: {
      ...realAuditLogModule,
      auditAdminAction: async () => {},
    },
  });

  ({ list, create } = await import(controllerUrl));
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

test('POST /v1/admin/live-classes: teacher is optional -- an admin-scheduled class inserts teacher_id=NULL, not a 400 or a DB constraint violation', async () => {
  calls = [];
  nextInsertRow = {
    id: 'new-class-1', teacher_id: null, student_id: 'student-uuid', title: 'Tajweed',
    starts_at: new Date(), duration_min: 30, meeting_url: null, notes: null,
    status: 'scheduled', created_at: new Date(), updated_at: new Date(),
  };

  const req = {
    body: { student: 'student-uuid', title: 'Tajweed', startsAt: new Date(Date.now() + 86400000).toISOString() },
    adminUser: { id: 'admin-uuid' },
    adminAal: 'aal2',
  };
  const res = fakeRes();
  await create(req, res);

  assert.equal(res._status, 201, `expected 201, got ${res._status}: ${JSON.stringify(res._body)}`);
  assert.equal(res._body.teacher, null);

  const insertCall = calls.find((c) => /INSERT INTO live_classes/.test(c.sql));
  assert.ok(insertCall, 'must have issued the INSERT');
  assert.equal(insertCall.params[0], null, 'teacher_id must be inserted as NULL, not omitted or defaulted to something else');
});

test('POST /v1/admin/live-classes: a teacher IS still passed through unchanged when the caller provides one (regression check)', async () => {
  calls = [];
  nextInsertRow = {
    id: 'new-class-2', teacher_id: 'teacher-uuid', student_id: 'student-uuid', title: 'Hifz',
    starts_at: new Date(), duration_min: 30, meeting_url: null, notes: null,
    status: 'scheduled', created_at: new Date(), updated_at: new Date(),
  };

  const req = {
    body: {
      teacher: 'teacher-uuid', student: 'student-uuid', title: 'Hifz',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
    },
    adminUser: { id: 'admin-uuid' },
    adminAal: 'aal2',
  };
  const res = fakeRes();
  await create(req, res);

  assert.equal(res._status, 201);
  const insertCall = calls.find((c) => /INSERT INTO live_classes/.test(c.sql));
  assert.equal(insertCall.params[0], 'teacher-uuid');
});

test('POST /v1/admin/live-classes: student/title/startsAt are still required (teacher becoming optional did not silently weaken the rest of the validation)', async () => {
  calls = [];
  const req = {
    body: { title: 'No student' /* student and startsAt missing */ },
    adminUser: { id: 'admin-uuid' },
    adminAal: 'aal2',
  };
  const res = fakeRes();
  await create(req, res);

  assert.equal(res._status, 400);
  assert.equal(calls.length, 0, 'must reject before ever touching the database');
});

test('GET /v1/admin/live-classes: no filter — no WHERE clause on either the data query or the count query', async () => {
  calls = [];
  const req = { query: {}, adminUser: { id: 'admin-uuid' }, adminAal: 'aal2' };
  const res = fakeRes();
  await list(req, res);

  assert.equal(res._status, 200);
  const dataCall  = calls.find((c) => /^\s*SELECT \* FROM live_classes/.test(c.sql));
  const countCall = calls.find((c) => /count\(\*\)/.test(c.sql));
  assert.ok(dataCall && countCall);
  assert.doesNotMatch(dataCall.sql, /WHERE/i);
  assert.doesNotMatch(countCall.sql, /WHERE/i);
});

test('GET /v1/admin/live-classes?upcoming=1: the SAME upcoming filter is applied to BOTH the data query and the count query', async () => {
  calls = [];
  const req = { query: { upcoming: '1' }, adminUser: { id: 'admin-uuid' }, adminAal: 'aal2' };
  const res = fakeRes();
  await list(req, res);

  assert.equal(res._status, 200);
  const dataCall  = calls.find((c) => /^\s*SELECT \* FROM live_classes/.test(c.sql));
  const countCall = calls.find((c) => /count\(\*\)/.test(c.sql));
  assert.ok(dataCall && countCall);

  const expectedFilter = /WHERE starts_at >= now\(\) AND status != 'cancelled'/;
  assert.match(dataCall.sql, expectedFilter, 'data query must filter to upcoming, non-cancelled classes');
  assert.match(
    countCall.sql,
    expectedFilter,
    'count query must apply the SAME filter -- otherwise `total`/`pages` would describe the wrong (unfiltered) result set',
  );
});
