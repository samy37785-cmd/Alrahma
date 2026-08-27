import adminHttp from './adminHttp';

export const getUsers               = ()                  => adminHttp.get('/v1/admin/users').then((r) => r.data);
export const adminCreateUser        = (data)              => adminHttp.post('/v1/admin/users', data).then((r) => r.data);
export const updateUserRole         = (id, role)          => adminHttp.patch(`/v1/admin/users/${id}/role`, { role }).then((r) => r.data);
export const assignTeacher          = (id, teacherId)     => adminHttp.patch(`/v1/admin/users/${id}/teacher`, { teacherId }).then((r) => r.data);
export const setFamilyName          = (id, familyName)    => adminHttp.patch(`/v1/admin/users/${id}/family`, { familyName }).then((r) => r.data);
export const listTeachers           = ()                  => adminHttp.get('/v1/admin/users/teachers').then((r) => r.data);
export const updateUserSubscription = (id, data)          => adminHttp.patch(`/v1/admin/users/${id}/subscription`, data).then((r) => r.data);
