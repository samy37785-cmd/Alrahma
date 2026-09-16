import http from './http';
import adminHttp from './adminHttp';

export const submitEnrollment = (data)     => http.post('/enrollments', data).then((r) => r.data);
export const getMyEnrollment  = ()         => http.get('/enrollments/mine').then((r) => r.data);
// Admin "Bookings" tab (AdminBookingsTab.jsx) reads/writes the hardened
// admin API (MFA + RBAC + audit-logged) — same generic v1 admin CRUD stack
// used for users/courses, not the legacy protect+adminOnly /api/enrollments
// list (routes/enrollmentRoutes.js, still mounted but no longer called from
// the frontend).
export const getEnrollments   = ()         => adminHttp.get('/v1/admin/enrollments').then((r) => r.data);
export const updateEnrollment = (id, data) => adminHttp.put(`/v1/admin/enrollments/${id}`, data).then((r) => r.data);
// Scope correction (see docs/current-project-status.md): the one admin
// action that links a booking to its registered account and activates
// their subscription/content access, end to end.
export const approveEnrollment = (id) => adminHttp.patch(`/v1/admin/enrollments/${id}/approve`).then((r) => r.data);
