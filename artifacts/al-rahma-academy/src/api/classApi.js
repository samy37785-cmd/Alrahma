import http from './http';
import adminHttp from './adminHttp';

// Listing is a real, role-aware regular-session self-service read (admin =
// all, teacher = theirs, student/parent = their own) — unaffected by this
// batch, stays on the plain `http` client.
export const getClasses  = (params)    => http.get('/classes', { params }).then((r) => r.data);

// Auth hardening security batch: AdminClassesTab.jsx (the real, MFA-gated
// admin SPA) used `getClasses` above for its own listing too — meaning its
// data depended on the operator ALSO holding a regular customer session
// with an admin-flagged `role`, on top of the real AdminUser + MFA one.
// This is the dedicated admin-session read instead, consistent with the
// mutations above.
// GET /v1/admin/live-classes returns the standard paginated admin-list
// envelope ({ data, total, page, pages }) under both backends (Mongo's
// controllers/liveClassController.js and Supabase's
// data/supabase/admin/liveClassesAdminController.js) — unified specifically
// because AdminClassesTab.jsx expects a plain array and previously crashed
// (classes.map is not a function) under DATA_BACKEND=supabase, which
// already returned the envelope while Mongo returned a bare array.
export const getAdminClasses = (params) => adminHttp.get('/v1/admin/live-classes', { params }).then((r) => r.data.data);

// Auth hardening security batch: create/update/delete used to go through
// the plain `http` client, hitting the legacy `staffOnly` (protect +
// User.role === 'admin'/'teacher') routes. AdminClassesTab.jsx (the real,
// MFA-gated admin SPA) is their only live consumer (see
// backend/routes/liveClassRoutes.js's own header comment), so they now go
// through `adminHttp` against the hardened /v1/admin/live-classes API.
export const createClass = (data)      => adminHttp.post('/v1/admin/live-classes', data).then((r) => r.data);
export const updateClass = (id, data)  => adminHttp.patch(`/v1/admin/live-classes/${id}`, data).then((r) => r.data);
export const deleteClass = (id)        => adminHttp.delete(`/v1/admin/live-classes/${id}`).then((r) => r.data);
