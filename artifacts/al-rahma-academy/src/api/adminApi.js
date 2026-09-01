import adminHttp from './adminHttp';

// adminCreateUser and assignTeacher were removed in Stage 2C (see
// docs/legacy-role-orphan-cleanup.md): both were zero-consumer legacy
// teacher/staff-account tools (adminCreateUser's only caller,
// AdminStaffTab.jsx, was deleted in Stage 2B; assignTeacher's only
// caller, AdminUsersTab.jsx's teacher-assignment control, was removed in
// this task since it exists to attach a student to a legacy teacher
// account - a concept the product no longer has). updateUserRole was
// already unused before this task (see AdminUsersTab.jsx's own header
// comment) and is left as-is - not in this task's deletion manifest.
export const getUsers               = ()                  => adminHttp.get('/v1/admin/users').then((r) => r.data);
export const updateUserRole         = (id, role)          => adminHttp.patch(`/v1/admin/users/${id}/role`, { role }).then((r) => r.data);
export const setFamilyName          = (id, familyName)    => adminHttp.patch(`/v1/admin/users/${id}/family`, { familyName }).then((r) => r.data);
export const listTeachers           = ()                  => adminHttp.get('/v1/admin/users/teachers').then((r) => r.data);
export const updateUserSubscription = (id, data)          => adminHttp.patch(`/v1/admin/users/${id}/subscription`, data).then((r) => r.data);
