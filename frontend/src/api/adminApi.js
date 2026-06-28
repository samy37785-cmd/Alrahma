import http from './http';

export const getUsers               = ()                  => http.get('/auth/users').then((r) => r.data);
export const adminCreateUser        = (data)              => http.post('/auth/users', data).then((r) => r.data);
export const updateUserRole         = (id, role)          => http.patch(`/auth/users/${id}/role`, { role }).then((r) => r.data);
export const assignTeacher          = (id, teacherId)     => http.patch(`/auth/users/${id}/teacher`, { teacherId }).then((r) => r.data);
export const setFamilyName          = (id, familyName)    => http.patch(`/auth/users/${id}/family`, { familyName }).then((r) => r.data);
export const listTeachers           = ()                  => http.get('/auth/teachers').then((r) => r.data);
export const updateUserSubscription = (id, data)          => http.patch(`/auth/users/${id}/subscription`, data).then((r) => r.data);