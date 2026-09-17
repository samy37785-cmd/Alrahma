import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { mock } from 'node:test';

// Production-readiness audit follow-up (2026-09-17): GET
// /api/v1/admin/certificates was completely unreachable under
// DATA_BACKEND=supabase (certificatesRouter in data/supabase/admin/
// adminRoutes.js only had POST/DELETE) -- a real, live gap, since
// AdminProgressModal.jsx's listCertificates(userId) is a real active
// consumer of this exact route on the Mongo side. Fixed by adding a real
// `list` export to certificatesAdminController.js and wiring
// certificatesRouter.get('/', ...). Same node:test module-mock technique
// as tests/supabase-live-classes-admin.test.js: intercept withUserContext()
// and drive a fake in-memory `pg` client. No real Postgres/Supabase
// connection is ever made.
const clientUrl = pathToFileURL(path.resolve('data/supabase/client.js')).href;
const controllerUrl = pathToFileURL(
  path.resolve('data/supabase/admin/certificatesAdminController.js'),
).href;

let calls;
let fakeRows;

function makeFakeClient() {
  return {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: fakeRows };
    },
  };
}

let list;

before(async () => {
  const realClientModule = await import(clientUrl);
  mock.module(clientUrl, {
    exports: {
      ...realClientModule,
      withUserContext: async (userId, fn) => fn(makeFakeClient()),
    },
  });
  ({ list } = await import(controllerUrl));
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

test.beforeEach(() => {
  calls = [];
  fakeRows = [];
});

test('GET /v1/admin/certificates (no filter): lists all certificates, including revoked ones, with no WHERE clause', async () => {
  fakeRows = [
    { id: 'c1', certificate_number: 'CERT-2026-0001', user_id: 'u1', student_name: 'A', type: 'completion', title: 'X', course_id: null, course_title: null, issued_by: 'Admin', grade: null, notes: null, issued_at: new Date(), revoked: false, created_at: new Date() },
    { id: 'c2', certificate_number: 'CERT-2026-0002', user_id: 'u2', student_name: 'B', type: 'ijazah', title: 'Y', course_id: null, course_title: null, issued_by: 'Admin', grade: null, notes: null, issued_at: new Date(), revoked: true, created_at: new Date() },
  ];
  const req = { query: {}, adminUser: { id: 'admin-uuid' } };
  const res = fakeRes();

  await list(req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.length, 2);
  assert.equal(res._body[1].revoked, true, 'admin listing must include revoked certificates too (unlike getMyCertificates)');
  const dataCall = calls.find((c) => /SELECT c\.\*/.test(c.sql));
  assert.doesNotMatch(dataCall.sql, /WHERE/i);
});

test('GET /v1/admin/certificates?userId=...: filters to that student only', async () => {
  fakeRows = [
    { id: 'c1', certificate_number: 'CERT-2026-0001', user_id: 'u1', student_name: 'A', type: 'completion', title: 'X', course_id: null, course_title: null, issued_by: 'Admin', grade: null, notes: null, issued_at: new Date(), revoked: false, created_at: new Date() },
  ];
  const req = { query: { userId: 'u1' }, adminUser: { id: 'admin-uuid' } };
  const res = fakeRes();

  await list(req, res);

  assert.equal(res._status, 200);
  const dataCall = calls.find((c) => /SELECT c\.\*/.test(c.sql));
  assert.match(dataCall.sql, /WHERE c\.user_id = \$1/);
  assert.equal(dataCall.params[0], 'u1');
});

test('response shape matches the Mongo contract: _id, certificateNumber, user, studentName, type, title, course, issuedBy, grade, notes, issuedAt, revoked', async () => {
  fakeRows = [{
    id: 'c1', certificate_number: 'CERT-2026-0001', user_id: 'u1', student_name: 'A',
    type: 'completion', title: 'X', course_id: 'course-1', course_title: 'Quran Basics',
    issued_by: 'Admin', grade: 'A+', notes: 'Great', issued_at: new Date('2026-01-01'), revoked: false, created_at: new Date(),
  }];
  const req = { query: {}, adminUser: { id: 'admin-uuid' } };
  const res = fakeRes();

  await list(req, res);

  const cert = res._body[0];
  assert.equal(cert._id, 'c1');
  assert.equal(cert.certificateNumber, 'CERT-2026-0001');
  assert.equal(cert.user, 'u1');
  assert.equal(cert.studentName, 'A');
  assert.deepEqual(cert.course, { _id: 'course-1', title: 'Quran Basics' });
  assert.equal(cert.grade, 'A+');
});
