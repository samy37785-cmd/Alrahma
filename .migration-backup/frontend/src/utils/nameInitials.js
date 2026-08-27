// Shared by DashboardLayout, AdminDashboard, ParentDashboard, Profile, and
// TeacherDashboard, which each previously had their own copy-pasted inline
// version of this exact expression.
export function getNameInitials(name) {
  return name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}
