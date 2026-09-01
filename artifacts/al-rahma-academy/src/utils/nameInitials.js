// Shared by DashboardLayout and Profile, which each previously had their
// own copy-pasted inline version of this exact expression. (TeacherDashboard.jsx
// and ParentDashboard.jsx, formerly also consumers, were deleted in Stage 2B
// and Stage 2C respectively; AdminDashboard.jsx's own use - initials for its
// legacy "Teachers list" card - was removed in the Stage 2C Final Corrective
// along with that card. See docs/legacy-role-dashboard-pruning.md,
// docs/legacy-role-orphan-cleanup.md, and docs/user-admin-auth-contract.md.)
export function getNameInitials(name) {
  return name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}
