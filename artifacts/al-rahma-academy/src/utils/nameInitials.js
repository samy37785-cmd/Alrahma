// Shared by DashboardLayout, AdminDashboard, and Profile, which each
// previously had their own copy-pasted inline version of this exact
// expression. (TeacherDashboard.jsx and ParentDashboard.jsx, formerly also
// consumers, were deleted in Stage 2B and Stage 2C respectively - see
// docs/legacy-role-dashboard-pruning.md and docs/legacy-role-orphan-cleanup.md.)
export function getNameInitials(name) {
  return name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}
