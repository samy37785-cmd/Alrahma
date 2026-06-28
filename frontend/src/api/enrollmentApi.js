import http from './http';

export const submitEnrollment = (data)     => http.post('/enrollments', data).then((r) => r.data);
export const getMyEnrollment  = ()         => http.get('/enrollments/mine').then((r) => r.data);
export const getEnrollments   = ()         => http.get('/enrollments').then((r) => r.data);
export const updateEnrollment = (id, data) => http.patch(`/enrollments/${id}`, data).then((r) => r.data);
