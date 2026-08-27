import http from './http';
import adminHttp from './adminHttp';

export const submitEnrollment = (data)     => http.post('/enrollments', data).then((r) => r.data);
export const getMyEnrollment  = ()         => http.get('/enrollments/mine').then((r) => r.data);
export const getEnrollments   = ()         => http.get('/enrollments').then((r) => r.data);
// Migrated to the hardened admin API (MFA + RBAC + audit-logged); note the
// verb change from PATCH to PUT, matching the generic v1 admin CRUD update.
export const updateEnrollment = (id, data) => adminHttp.put(`/v1/admin/enrollments/${id}`, data).then((r) => r.data);
