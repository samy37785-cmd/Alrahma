import { describe, it, expect, afterEach } from 'vitest';

// Review follow-up (auth hardening batch): GET /v1/admin/live-classes used
// to return a bare array in Mongo mode while the Supabase-mode controller
// (backend/data/supabase/admin/liveClassesAdminController.js) already
// returned the standard { data, total, page, pages } paginated envelope
// every other /v1/admin/* list endpoint uses. AdminClassesTab.jsx calls
// classes.map(...)/classes.length directly on whatever getAdminClasses()
// resolves to — under the Supabase shape that crashed (classes.map is not
// a function). Mongo's controller was changed to match the same envelope
// (see controllers/liveClassController.js), and getAdminClasses() here now
// unwraps it — this test proves that unwrap against the REAL Supabase
// response shape, not an assumption of it, using the same
// custom-axios-adapter technique adminHttp.test.js already established for
// exercising real client code without a live/mocked HTTP server.
import adminHttp from '../api/adminHttp';
import { getAdminClasses } from '../api/classApi';

const originalAdapter = adminHttp.defaults.adapter;

afterEach(() => {
  adminHttp.defaults.adapter = originalAdapter;
});

function respondWith(body) {
  adminHttp.defaults.adapter = (config) =>
    Promise.resolve({ data: body, status: 200, statusText: 'OK', headers: {}, config });
}

describe('classApi.getAdminClasses', () => {
  it('unwraps the { data, total, page, pages } envelope (the real Supabase-mode response shape) down to the plain array AdminClassesTab.jsx expects', async () => {
    const classes = [
      { _id: 'c1', title: 'Tajweed', teacher: 'teacher-uuid', student: 'student-uuid', status: 'scheduled' },
      { _id: 'c2', title: 'Hifz Review', teacher: 'teacher-uuid-2', student: 'student-uuid-2', status: 'scheduled' },
    ];
    respondWith({ data: classes, total: 2, page: 1, pages: 1 });

    const result = await getAdminClasses();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(classes);
  });

  it('unwraps the same envelope shape when Mongo mode returns an empty page (no classes yet)', async () => {
    respondWith({ data: [], total: 0, page: 1, pages: 0 });

    const result = await getAdminClasses();

    expect(result).toEqual([]);
  });
});
