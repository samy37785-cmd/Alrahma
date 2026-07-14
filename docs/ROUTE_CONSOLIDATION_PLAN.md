# Route-stack consolidation plan (roadmap Phase 7 → future PRs)

## Current state (deliberate, mid-migration)

Every privileged admin **mutation** lives on `routes/v1/admin/*` (MFA
`AdminUser` session + RBAC + audit logging). Legacy top-level route files
keep public/student routes and admin **reads** (`protect`+`adminOnly`).
Naming drifted between the stacks (`couponRoutes.js` vs `couponsRoutes.js`).

## Target

One stack per audience: all admin **reads** join their resources'
mutations under `/api/v1/admin/*`; the legacy stack keeps only
public/student surfaces. Public routes gain an explicit version story.

## Migration steps (one resource per PR, frontend + backend together)

1. For each resource with split reads (coupons, contact, certificates,
   reviews, community, manual payments list, users/enrollments as
   applicable):
   - add the read endpoint to `routes/v1/admin/<resource>Routes.js`
     (RBAC `<resource>:read`),
   - point the corresponding `frontend/src/api/adminApi.js` call at it,
   - keep the legacy read mounted for one release as a fallback, then
     remove it.
2. Normalize route-file naming to plural on v1 while touching each file.
3. Decide the public-API version story last (either freeze the current
   unversioned surface as implicitly v1 and mount `/api/v1/*` aliases, or
   document the unversioned surface as stable) — an ADR at that point.

## Why not done in the Phase 7 refactoring PR

Each step swaps the auth model for a live admin surface (session cookie +
CSRF semantics differ between the stacks) and needs its own test/UI
verification; batching them contradicts the roadmap's own risk rules.

## Also explicitly queued (with reasons)

- **`useQuranVerses` React Query migration**: the verse-loading effect in
  `pages/Quran.jsx` interleaves fetching with player-state resets
  (`setIsPlaying(false)`, tafsir close, Hifz verse-range reset) — moving it
  to React Query changes navigation semantics, not just data fetching. It
  needs a hook design that owns those reset semantics plus focused tests;
  the e2e quran baseline deliberately masks verse content and cannot catch
  regressions there.
- **Backend Prettier mass-format**: deferred permanently unless the team
  wants the git-blame churn; lint (0 errors) already gates style basics.
- **Locale `index.html` mirrors (`public/fr`, `public/it`)**: hand-mirrored
  today; generating them at prebuild needs a template + per-locale meta
  data set — worth doing next time their content actually changes.
