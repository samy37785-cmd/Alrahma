// Shared by DashboardLayout, AdminDashboard, ParentDashboard, and Profile,
// which each previously had their own copy-pasted inline version of this
// exact expression. (TeacherDashboard.jsx, formerly also a consumer, was
// deleted in Stage 2B - see docs/legacy-role-dashboard-pruning.md.)
export function getNameInitials(name) {
  return name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}
