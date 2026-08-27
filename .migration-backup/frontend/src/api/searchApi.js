import http from './http';

export const globalSearch   = (q, signal)      => http.get('/search', { params: { q }, signal }).then((r) => r.data);
export const searchCourses  = (params, signal) => http.get('/search/courses', { params, signal }).then((r) => r.data);
export const searchTeachers = (params, signal) => http.get('/search/teachers', { params, signal }).then((r) => r.data);
