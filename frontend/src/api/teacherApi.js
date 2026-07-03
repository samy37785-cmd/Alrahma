import http from './http';

export const getMyStudents      = ()           => http.get('/teacher/students').then((r) => r.data);
export const getStudentDetail   = (id)         => http.get(`/teacher/students/${id}`).then((r) => r.data);
export const addStudentRecord   = (id, data)   => http.post(`/teacher/students/${id}/records`, data).then((r) => r.data);
export const deleteStudentRecord = (recordId)  => http.delete(`/teacher/records/${recordId}`).then((r) => r.data);
