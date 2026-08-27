import http from './http';

export const linkChild      = (code) => http.post('/parent/link', { code }).then((r) => r.data);
export const getMyChildren  = ()     => http.get('/parent/children').then((r) => r.data);
export const getChildDetail = (id)   => http.get(`/parent/children/${id}`).then((r) => r.data);
export const unlinkChild    = (id)   => http.delete(`/parent/children/${id}`).then((r) => r.data);
