import adminHttp from './adminHttp';

// adminCreateUser and assignTeacher were removed in Stage 2C (see
// docs/legacy-role-orphan-cleanup.md). Stage 2C Final Corrective (see
// docs/user-admin-auth-contract.md) removes three more, all confirmed
// zero-consumer and tied to the deleted account-role model:
//   - updateUserRole: was already unused before that task too (see
//     AdminUsersTab.jsx's own former header comment) - a real, unaudited
//     admin-elevation path (PATCH .../role) never actually wired to any
//     UI control in this codebase's real history.
//   - listTeachers: backed AdminDashboard.jsx's "Teachers list" KPI card,
//     a list of legacy teacher *accounts* (GET .../users/teachers) -
//     unrelated to the public teacher directory, which is static content
//     with no API dependency at all (see Teachers.jsx/TeacherProfile.jsx).
//   - setFamilyName: backed AdminUsersTab.jsx's "Family" column, gated on
//     the now-removed `u.role === 'student'` check, with zero
//     documentation anywhere and zero other consumer that ever read the
//     field back.
export const getUsers               = ()                  => adminHttp.get('/v1/admin/users').then((r) => r.data);
export const updateUserSubscription = (id, data)          => adminHttp.patch(`/v1/admin/users/${id}/subscription`, data).then((r) => r.data);
