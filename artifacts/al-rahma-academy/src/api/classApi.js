import http from './http';
import adminHttp from './adminHttp';

// A teacher's, student's or parent's own classes (/api/classes, regular session).
export const getClasses  = (params)    => http.get('/classes', { params }).then((r) => r.data);
export const createClass = (data)      => http.post('/classes', data).then((r) => r.data);
export const updateClass = (id, data)  => http.patch(`/classes/${id}`, data).then((r) => r.data);
export const deleteClass = (id)        => http.delete(`/classes/${id}`).then((r) => r.data);

// The admin console's Classes tab: every class, through the MFA admin API.
// adminGetClasses answers { data, total, page, pages }. A class needs a
// teacher chosen from adminGetTeachers (existing teacher accounts).
export const adminGetClasses  = (params)   => adminHttp.get('/v1/admin/live-classes', { params }).then((r) => r.data);
export const adminCreateClass = (data)     => adminHttp.post('/v1/admin/live-classes', data).then((r) => r.data);
export const adminUpdateClass = (id, data) => adminHttp.patch(`/v1/admin/live-classes/${id}`, data).then((r) => r.data);
export const adminDeleteClass = (id)       => adminHttp.delete(`/v1/admin/live-classes/${id}`).then((r) => r.data);
export const adminGetTeachers = ()         => adminHttp.get('/v1/admin/users/teachers').then((r) => r.data);
