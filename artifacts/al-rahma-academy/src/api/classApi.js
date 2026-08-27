import http from './http';

export const getClasses  = (params)    => http.get('/classes', { params }).then((r) => r.data);
export const createClass = (data)      => http.post('/classes', data).then((r) => r.data);
export const updateClass = (id, data)  => http.patch(`/classes/${id}`, data).then((r) => r.data);
export const deleteClass = (id)        => http.delete(`/classes/${id}`).then((r) => r.data);
