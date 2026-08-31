# User/Admin Auth Contract (Stage 2A)

**Stage 2A — User/Admin Auth Contract and Safe Routing Remediation.** Local frontend implementation; no Supabase/Remote/SQL/migration/RLS work; no Push/Merge/PR/Deploy.

Starting SHA: `49fe8b567e63339491860c443e7f382c203d7a1a` (= `checkpoint/stage-02-role-audit-complete`, the closing commit of `docs/legacy-roles-dashboard-reachability-audit.md`)
Branch: `feat/user-admin-auth-contract`
Date: 2026-08-31

---

## 1. Current legacy reality (before this stage)

Two unrelated role systems coexisted in the frontend:

- A legacy 4-value `User.role` field (`student`/`teacher`/`parent`/`admin`), sourced from `AuthContext.jsx`'s regular login/register/`getMe()` responses. `AuthContext.jsx` derived `isAdmin: user?.role === 'admin'`, `isTeacher: user?.role === 'teacher'`, `isParent: user?.role === 'parent'` directly from this field and exposed them to every consumer.
- A separate, hardened `AdminUser` + TOTP-MFA session (`AdminAuthContext.jsx`, httpOnly `admin_at`/`admin_rt` cookies), the actual protection for `/api/v1/admin/*`.

The security defect this created: `ProtectedRoute.jsx`'s `adminOnly` guard checked `isAdmin` from the **first** system (`user.role === 'admin'`), not the second. A regular account whose `role` field said `'admin'` — however that value got there (registration, a legacy API response, a spoofed/cached localStorage profile) — passed the `adminOnly` check without ever touching the real AdminUser/MFA system. `/admin/login` was itself wrapped in `<ProtectedRoute adminOnly>`, so an unauthenticated visitor trying to reach the admin login page was bounced to `/login` first — the circular-guard bug. `/teacher` and `/parent` selected `TeacherDashboard`/`ParentDashboard` by the same untrusted `role` field. `Register.jsx` showed a `student`/`parent` account-type `<select>` and used the chosen value both in the registration payload and to pick a post-registration redirect. `Dashboard.jsx`, `TeacherDashboard.jsx`, and `ParentDashboard.jsx` all read `t.dashboard.roles`/`t.dashboard.items` — keys that exist only on `getExperienceText(lang).dashboard` (`i18n/experience.js`), not on the per-locale `t.dashboard` object (`i18n/en.js` etc, which only has plain strings like `greetingMorning`) — so all three threw a `TypeError` unconditionally in their page header, in every locale. All of this is exactly what `docs/legacy-roles-dashboard-reachability-audit.md` documented; this stage did not find anything in conflict with that audit's conclusions.

## 2. Target contract (unchanged from the task brief)

1. Every public account is `user`. 2. The only distinguished role is `admin`, proven exclusively by a real `AdminUser` + MFA session. 3. No independent `teacher`/`parent`/`student` account types exist. 4. Admin is a separate system (`AdminUser`, Admin session, TOTP/MFA, an `adminOnly` guard applied after successful admin authentication). 5. A `role: 'admin'` value from public registration, a regular-user API response, or localStorage does not grant Admin. 6. Public registration has no role selector and sends no caller-controlled role. 7. The generic Dashboard is the `user` destination. 8. `/admin/login` is reachable pre-authentication. 9. Only the admin pages themselves require a valid Admin session + MFA.

The DB layer (`lib/db`) already implements this exactly (`account_role` enum is `user`/`admin`-only, `handle_new_user()` ignores client metadata) — this stage brought the frontend into line with a layer that was already correct, per the audit's §1.

## 3. Regular-auth vs. Admin-auth separation

`src/utils/accountRoles.js` is the new single source of truth:

- `ACCOUNT_ROLES = { USER: 'user', ADMIN: 'admin' }` (frozen).
- `normalizeAccountRole(rawRole)` **always** returns `'user'` — this is deliberate, not a bug: there is no other regular-account value left to distinguish once `teacher`/`parent`/`student` are retired, and a spoofed `role: 'admin'` on a regular account must not survive normalization either.
- `isRegularUser(rawRole)` — `normalizeAccountRole(rawRole) === 'user'` (true for every input, by construction).
- `isVerifiedAdminSession(adminUser)` — `Boolean(adminUser)`. This is **the only function in the app allowed to answer "is this an admin?"**, and it must only ever be called with `AdminAuthContext`'s `adminUser` value. It cannot itself verify that the object it receives came from a real login+MFA flow — that guarantee is architectural (every real call site passes only `useAdminAuth().adminUser`, which is populated exclusively by `adminLogin`/`adminMfaConfirm`/`adminMfaVerify`), not something a pure function can check. This is documented explicitly, not silently assumed, in both the module's own comments and `accountRoles.test.js`.

`AuthContext.jsx` no longer exposes `isAdmin`/`isTeacher`/`isParent` at all — the regular auth context makes no claim about admin status. `AdminAuthContext.jsx` now exposes `isAdmin: isVerifiedAdminSession(adminUser)` as its one authoritative signal. Every consumer that used to read `isAdmin`/`isTeacher`/`isParent` from `useAuth()` (`ProtectedRoute.jsx`, `Header.jsx`, `DashboardLayout.jsx`, `CommandPalette.jsx`) now reads `isAdmin` from `useAdminAuth()` instead; `MobileBottomNav.jsx` receives it as a prop from `DashboardLayout`.

**Frontend-hardening disclaimer:** this guard is a UX convenience, not a security boundary. The real authorization boundary is the API/database layer (`lib/db`'s RLS, `admin_set_role()`'s AAL2 gate), which this frontend change cannot see or prove. `ProtectedRoute.jsx` carries this exact disclaimer in its own header comment.

## 4. Role-normalization matrix

| Input `role` value | `normalizeAccountRole()` result | Grants Admin? |
|---|---|---|
| `'user'` | `'user'` | No |
| `'teacher'` (legacy) | `'user'` | No |
| `'parent'` (legacy) | `'user'` | No |
| `'student'` (legacy) | `'user'` | No |
| `'admin'` (regular account, however set) | `'user'` | **No — never** |
| `undefined` / `null` / `''` | `'user'` | No |
| any other/invalid value | `'user'` | No |
| — (separately) a real `AdminAuthContext.adminUser` object | n/a (not a `role` value) | **Yes, via `isVerifiedAdminSession()`** |

## 5. Registration payload policy

Before: `{ name, email, password, role: 'student' | 'parent' }` — the `<select>`'s value went straight into the API call and into a role-based post-registration redirect (`navigate(form.role === 'parent' ? '/parent' : '/dashboard')`).

After: `{ name, email, password }` — no `role`/`accountType` key at all. Verified by grep (`lib/api-zod`, `lib/api-spec`, `lib/api-client-react`) that no tracked API contract requires a `role` field on registration, so the field was dropped entirely rather than injecting a fixed `'user'` constant at an API boundary that doesn't need one. Post-registration navigation is unconditionally `navigate('/dashboard', { replace: true })`. `Register.test.jsx` proves: no role/account-type selector renders; the payload sent to `registerUser()` never contains `role`/`accountType`; a spoofed `role`/`accountType` sitting in `localStorage` before submission is ignored (the form only ever reads its own controlled `name`/`email`/`password` state); a spoofed `?role=admin&accountType=teacher` query string on `/register` is ignored; even a response that claims `role: 'admin'` still lands the new account on `/dashboard`, never anywhere else.

Not claimed: that the external Upstream (`UPSTREAM_API_ORIGIN`, unverifiable from this repo per the audit's API-ownership section) actually enforces `role: 'user'` server-side for the accounts it creates. That remains Remote-integration-unknown, honestly, same as the audit found it.

## 6. Route matrix — before vs. after

| Route | Before | After |
|---|---|---|
| `/dashboard` | `ProtectedRoute` → `Dashboard` | unchanged |
| `/teacher` | `ProtectedRoute role="teacher"` → `TeacherDashboard` | `<Navigate to="/dashboard" replace />` |
| `/parent` | `ProtectedRoute role="parent"` → `ParentDashboard` | `<Navigate to="/dashboard" replace />` |
| `/admin/login` | `ProtectedRoute adminOnly` → `AdminLogin` (circular: required being logged in as admin to reach the admin login page) | `AdminLogin` directly, no wrapper — reachable pre-authentication; `AdminLogin` itself redirects to `/admin` if a valid `adminUser` session already exists |
| `/admin` | `ProtectedRoute adminOnly` (checked the WRONG `isAdmin`) → `AdminSessionGate` → `AdminDashboard` | `ProtectedRoute adminOnly` (now checks the REAL `isAdmin` from `AdminAuthContext`) → `AdminSessionGate` (redundant second check of the same real session — left in place, not removed, since it is still correct and Stage 2A does not delete files/components) → `AdminDashboard` |
| `/login` success | `goToRole(user)`: `{admin:'/admin', teacher:'/teacher', parent:'/parent'}[user.role] \|\| '/dashboard'` | `goToRole()`: always `/dashboard` (or a safe `?redirect=`/`state.from`), regardless of any role value on the response |

`TeacherDashboard.jsx`/`ParentDashboard.jsx` are no longer imported by `App.jsx` at all (dead lazy-import removed) — the files themselves are untouched-but-for-the-`t.dashboard` fix (§8) and remain on disk, per the explicit "do not delete" constraint.

## 7. Admin login/guard behavior

- `/admin/login`: reachable by an unauthenticated visitor. If a valid `adminUser` session already exists, `AdminLogin` redirects to `/admin` (or a safe `state.from`) instead of showing the form again.
- `/admin`: `ProtectedRoute adminOnly` renders children only when `isVerifiedAdminSession(adminUser)` is true; otherwise it redirects to `/admin/login`. It no longer requires (or even checks) a regular user session for an `adminOnly` route — a visitor with zero regular login can still reach `/admin/login` and authenticate as admin directly, matching "only the admin pages themselves require a valid Admin session + MFA."
- No redirect loop: `/admin/login`'s only automatic redirect target is `/admin`, reachable only with a real `adminUser`; `/admin`'s only automatic redirect target is `/admin/login`, reachable by everyone. Each direction terminates in one hop.
- `returnTo`/`state.from` safety: unchanged, still routed through the existing `safeInternalDestination()` helper (not touched in this stage — already restricted to internal paths).

## 8. How spoofed admin is prevented

Proven by `ProtectedRoute.test.jsx` (real `AuthProvider`+`AdminAuthProvider`, mocked only at the `api/*.js` network boundary):

- No `AdminUser` session at all → `adminOnly` redirects to `/admin/login`.
- A cached `AdminUser` session → renders protected content, **without ever calling the regular session API** (`getMe` not called) — proving `adminOnly` no longer depends on regular auth at all.
- A regular user logged in, but with no `AdminUser` session → still denied, redirected to `/admin/login`.
- **A regular account whose cached/returned `role` field is literally `'admin'`, with no real `AdminUser` session → still denied.** This is the core Stage 2A security property and is the specific scenario the pre-existing bug allowed.

## 9. The `t.dashboard` fix — result per language

Root cause: `t.dashboard` (from `i18n/en.js`/`ar.js`/`it.js`/`es.js`/`de.js`/`fr.js`) only ever had flat greeting/loading/quick-action strings; `roles`/`items` sub-objects exist only on the separate `getExperienceText(lang).dashboard` object (`i18n/experience.js`), which `DashboardLayout.jsx`/`MobileBottomNav.jsx`/`CommandPalette.jsx`/`NotificationPanel.jsx` were already reading correctly. `Dashboard.jsx`, `TeacherDashboard.jsx`, and `ParentDashboard.jsx` were the three call sites still reading `t.dashboard.roles`/`t.dashboard.items` directly.

Fix applied identically in all three files: `const dashboardCopy = getExperienceText(lang).dashboard;`, then every `t.dashboard.roles.*`/`t.dashboard.items.*` reference retargeted to `dashboardCopy.roles.*`/`dashboardCopy.items.*`. `t.dashboard.greetingMorning` etc. (which genuinely exist on the per-locale `t.dashboard` object) were left untouched. No new translation keys were added; no component content was redesigned.

| Language | `Dashboard.jsx` | `TeacherDashboard.jsx` | `ParentDashboard.jsx` |
|---|---|---|---|
| en | fixed, tested | fixed (not route-reachable, kept working per the "if cheap, do it" instruction) | fixed (same) |
| ar (RTL) | fixed, tested — `<html dir="rtl">` confirmed | fixed | fixed |
| fr | fixed, tested | fixed | fixed |
| it | fixed, tested | fixed | fixed |
| es | fixed, tested | fixed | fixed |
| de | fixed, tested | fixed | fixed |

`Dashboard.locales.test.jsx` headlessly renders `Dashboard.jsx` in all 6 locales (`LANGS` from `i18n/index.js`) and asserts no throw, plus a dedicated Arabic-RTL assertion and an English-LTR assertion, plus a scoped check that the eyebrow element actually contains the translated `roles.student`/`items.dashboard` text (not just "didn't crash"). `TeacherDashboard.jsx`/`ParentDashboard.jsx` were fixed at the same time (cheap, identical pattern, no redesign) but are not separately locale-tested here since they are unreachable via routing (§6) — this is noted as a minor, low-risk gap, not a redesign deferral.

## 10. What was proven locally vs. not provable due to the external Upstream

**Proven locally (real code, real tests, no Remote):** role normalization always resolves to `'user'` except for a real `AdminAuthContext.adminUser`; registration sends no caller-controlled role and ignores every spoofing vector tried (form, localStorage, query string); `/admin/login` is reachable pre-auth and loop-free; `/admin`/`adminOnly` deny a regular user and a regular account spoofing `role: 'admin'`, and allow a real cached `AdminUser` session without touching the regular-session API; `/teacher`/`/parent` no longer select a role-specific dashboard; the generic Dashboard renders without throwing in all 6 locales, with Arabic RTL preserved; navigation has no teacher/parent/student branches and sources `isAdmin` only from the real Admin session.

**Not, and cannot be, proven from this repository:** whether the external Upstream (`UPSTREAM_API_ORIGIN`, an untracked Render-hosted service every non-`/healthz` `/api/*` call proxies to) actually enforces any of this server-side — whether it accepts a roleless registration payload, whether it still issues a `role` field on login/`getMe`, whether its own admin-elevation logic (if any exists there) is safe. This was Remote-integration-unknown before this stage and remains exactly that after it; nothing in this stage's tests or claims implies otherwise.

## 11. Old files that became unreachable but were not deleted

`TeacherDashboard.jsx`, `ParentDashboard.jsx` — no longer imported by `App.jsx`, no route selects them; both still exist on disk, both still compile/typecheck, both had their `t.dashboard` crash fixed. `StudentModal.jsx`, `ChildModal.jsx`, `AdminStaffTab.jsx` were not touched at all in this stage (not imported by the two dashboards' removal — they remain wired exactly as the audit found them, deferred to Batch 2B along with the two dashboard files themselves, per the audit's §16/§17 deletion manifest, which this stage does not execute).

## 12. Prerequisites for Batch 2B

Batch 2B (per the audit's §17) is the deletion of the 5-file manifest (`TeacherDashboard.jsx`, `ParentDashboard.jsx`, `StudentModal.jsx`, `ChildModal.jsx`, `AdminStaffTab.jsx`). This stage's work is a clean prerequisite for it: both dashboards are now provably unreachable via any route (§6, tested in `appRouting.stage2a.test.js`), so deleting them next is a pure dead-code removal with no routing/auth follow-up required. No other prerequisite work is outstanding for 2B specifically.

## 13. Deferred server/Supabase enforcement

Everything in this stage is a frontend change only. The actual, provable enforcement of "no `teacher`/`parent`/`student` account type, admin only via `admin_set_role()`+AAL2" lives in `lib/db`'s already-correct schema/RLS/triggers (per the audit's §1) and is inert until Stage 4 (Supabase integration, per the master reconciliation plan) wires `artifacts/api-server` to it and cuts the frontend's `src/api/http.js` over from the legacy Mongo/Render backend. Until then, the frontend's role/admin hardening in this stage narrows what the UI *offers* and *trusts*, but the actual account creation, login, and role assignment continue to run through the unverified external Upstream exactly as before.

## 14. Frontend hardening is not a substitute for server/RLS enforcement (explicit confirmation)

Every guard changed in this stage — `ProtectedRoute.jsx`'s `adminOnly` check, `AdminSessionGate.jsx`, the registration payload shape, the route table — is client-side JavaScript. A determined attacker who bypasses the frontend entirely (calls the API directly) is bound only by whatever the real server enforces, which this repository cannot fully see (§10). This stage's tests prove the frontend's own behavior; they do not and cannot prove server-side enforcement. The real authorization boundary remains the database layer (`account_role` enum, `handle_new_user()`, `admin_set_role()`'s AAL2 gate, RLS policies) and, once wired up in Stage 4, `artifacts/api-server`'s own request handling — not this frontend.

---

## Appendix: known non-blocking notes from this stage

- `ProgressRing` is imported but unused in both `TeacherDashboard.jsx` and `ParentDashboard.jsx` — pre-existing, not caused by this stage's edits (confirmed by grep: only the import line references it). Not cleaned up here since it is unrelated to the Stage 2A files-edited-for-a-reason list; left for a future pass.
- A broader set of pre-existing, likely-dead `lucide-react` icon imports was observed (not introduced by this stage) in `Dashboard.jsx` (`Target`, `Moon`, `ListChecks`, `PenLine`) and `DashboardLayout.jsx` (a long list), plus `WishlistButton`/`DsBarChart`/`DsChartEmpty` in `Dashboard.jsx` and `NavIcon` in `MobileBottomNav.jsx`. These predate Stage 2A and were not introduced or worsened by it; a proper cleanup pass would need to verify each one individually (some may be used via dynamic/indirect references this note's grep-based check would miss) rather than being swept in here.
- `Header.jsx`'s mobile profile strip still renders the raw, untranslated legacy `user.role` string (`<span className="nav__mobile-profile-role">{user.role}</span>`) rather than a locale-aware label. This is a cosmetic leftover, not a security or routing issue (the routing/admin-gating logic never reads this span), and is deferred to Batch 2C's broader translation cleanup rather than fixed here to avoid expanding this stage's translation-key surface.
- `AdminUsersTab.jsx`'s role display was changed from an interactive `<select>` (calling `updateUserRole()` against the reverse-proxied, unverified external Upstream) to a read-only badge; the mutation is disabled rather than wired to `admin_set_role()` (which is not connected anywhere in this app). Full read/write role management against a proven Supabase-backed RPC is deferred to Batch 2E, as the task brief anticipated.

---

## Appendix (Stage 2B Part A): evidence-gap closure — everything below is corrective, added after the fact; nothing above this line was rewritten

Stage 2B (see `docs/legacy-role-dashboard-pruning.md`) re-verified every claim this document made, from the actual code, not from re-reading its own prose. This appendix records what that re-verification found — most of it confirmed the original claims; two things were genuine gaps that are closed here.

### A.1 Registration payload — re-verified, confirmed correct

Traced the full pipeline again end to end: `Register.jsx`'s `form` state (`{name, email, password}`, populated only from `handleChange` reading the three actual named `<input>`s — there is no fourth field anywhere in the JSX) → `useAuth().register(form)` → `AuthContext.jsx`'s `register()` → `registerUser(info)` in `api/authApi.js` (`http.post('/auth/register', data)`, `data` sent verbatim) → `api/http.js`'s axios instance (its only interceptor adds a CSRF header on mutating requests; it never reads or rewrites the request body). **Confirmed: `role` is absent from the payload at every step — no query param, hidden field, or localStorage read feeds it anywhere in this path.** No fix was needed. Not claimed: whether the external Upstream still issues/expects a `role` field on its side — that remains Remote-integration-unknown, unchanged from §10 above.

### A.2 Admin session — re-verified, one real (pre-existing, low-severity) gap found and precisely characterized

`adminUser` comes from `AdminAuthContext.jsx`'s `useState(() => JSON.parse(localStorage.getItem('adminUser')))` — restored **as a local object-shape check only**, with **no server-side re-validation call on restore**. This is different from the regular `AuthContext`, which calls `ensureSession()` (a real `getMe()` round trip) whenever a cached profile exists. `isVerifiedAdminSession(adminUser)` is `Boolean(adminUser)` — it cannot and does not claim to know whether the object came from a real login+MFA flow (its own JSDoc says this explicitly).

**Can manually editing `localStorage.adminUser` make the Admin UI shell render?** Yes. `ProtectedRoute adminOnly` and `AdminSessionGate` both pass on a mere truthy cached object, so `AdminDashboard` will mount.

**Does this expose real admin data or let a real mutation succeed?** No. `AdminDashboard`'s data (`getUsers`, `getCourses`, `getManualPayments`, etc.) and every mutation go through `adminHttp`, a **separate** axios instance requiring the real httpOnly `admin_at`/`admin_rt` cookies. A forged `localStorage` profile has no such cookies, so every one of these calls 401s immediately; `adminHttp`'s existing response interceptor (unchanged, already present before Stage 2A) attempts exactly one silent refresh via the real `adminRefresh()` endpoint, which also fails with no valid `admin_rt` cookie, and then calls `clearSessionAndRedirect()` — clearing the forged `localStorage.adminUser` and doing a full `window.location.assign('/admin/login')`. In practice this is a brief (roughly one network round-trip) flash of an empty dashboard shell with no real data in it (every list/count is empty or loading), self-correcting automatically. This is the exact, already-documented design tradeoff `AdminSessionGate.jsx`'s own pre-existing comment describes ("caught on the first real API call instead ... this only needs to gate the initial render") — it predates Stage 2A and Stage 2A did not touch `AdminSessionGate.jsx`.

**Why no code fix was made:** the only way to close even this narrow, no-real-exposure gap is a mount-time proactive call to `adminRefresh()` — but that endpoint rotates the one-time-use `admin_rt` cookie on every call (per its own source comment), and this repository has no way to observe or test the real backend's behavior when that rotation is triggered eagerly on every page load (multi-tab timing, an admin whose `admin_at` was still perfectly valid, etc.) without touching Remote, which this task forbids. Introducing an unproven proactive-refresh mechanism risked a real functional regression (spuriously logging out a legitimate admin) in exchange for closing a gap that already causes no real data or capability exposure. Per this task's own instruction — fix what's safely fixable, keep server enforcement as an explicit blocker rather than invent unproven validation — **no runtime behavior was changed here.** This is now precisely documented instead of left implicit.

**Is Admin API enforcement itself proven server-side?** **UNKNOWN**, unchanged from §10/§13 above — this repository has no visibility into the real Upstream's cookie validation.

### A.3 AdminUsersTab — re-verified, one real test-coverage gap found and closed

The Stage 2A description (read-only role badge, no teacher/parent/student options, no client-side elevation, no false claim that `admin_set_role()` is wired) was confirmed accurate against the current code. Two things were fixed in Stage 2B: (1) the disabled-role-changes message was a hover-only `title` tooltip, not visible without hovering — a persistent, always-visible `<p className="admin__hint">` note was added instead; (2) **`AdminUsersTab.jsx` had zero dedicated tests** (`AdminDashboard.test.jsx` mocks it out entirely) — `AdminUsersTab.test.jsx` (5 tests) now covers: the role column is plain text with no interactive control; the disabled message is visible; no mutation is ever triggered by interacting with the badge; the still-live teacher-assignment and subscription actions are unaffected.

### A.4 CalendarPage.jsx, DashboardLayout.jsx, AdminUsersTab.jsx, TeacherDashboard.jsx, ParentDashboard.jsx — Stage 2A diffs re-examined

Re-read each file's exact `git diff 49fe8b5 5fac82d` in full. All five diffs are traceable, in every line, to either (a) the `isAdmin`/`isTeacher`/`isParent` sourcing fix (`useAuth()` → `useAdminAuth()`, removing dead teacher/parent branches) or (b) the `t.dashboard.roles`/`items` crash fix (`getExperienceText(lang).dashboard` retargeting) or (c) the previously-flagged dead-import cleanup (`Save`/`AlertCircle`/`X`). No unrelated change was found in any of the five; nothing needed to be reverted.

### A.5 Test classification (see also §5 above, which listed the 7 Stage 2A files without categorizing them)

| Test file | Category | What it actually exercises |
|---|---|---|
| `accountRoles.test.js` | Unit contract | Real function calls on `normalizeAccountRole`/`isRegularUser`/`isVerifiedAdminSession`, asserting real return values |
| `Register.test.jsx` | Behavioral render + API payload | Real component render, real form fill/submit, inspects the real mock call's argument object |
| `ProtectedRoute.test.jsx` | Behavioral render/navigation | Real `AuthProvider`+`AdminAuthProvider`+`MemoryRouter`, real redirect assertions |
| `Dashboard.locales.test.jsx` | Behavioral render | Real component render in 6 locales, DOM assertions |
| `Login.stage2a.test.jsx` | Behavioral render/navigation | Real component render, real form submit, real redirect assertion |
| `appRouting.stage2a.test.js` | Static source guard | Regex over `App.jsx`'s text — **not** a rendering test |
| `navigation.stage2a.test.js` | Mixed: unit contract (arity/return-value checks on `navFor`/`bottomNavFor`/`roleLabel`) + static source guard (the `useAdminAuth`/`useAuth()` destructure checks) | |

`appRouting.stage2a.test.js` being static-only was a real gap against this task's "route redirect behavior" behavioral-coverage requirement — closed in Stage 2B by `appRouting.behavioral.stage2a.test.jsx` (new), which renders the **real, full `App` component** (mocked only at the `api/*.js` boundary) and drives real `window.history` navigation, proving `/teacher`→`/dashboard`, `/parent`→`/dashboard`, `/admin/login` reachable unauthenticated, and `/admin` denying an unauthenticated visitor — end to end, not from source text. "Admin login" behavioral coverage already existed and needed no new work: `AdminLogin.test.jsx` (pre-existing, real component render, real form interactions).

### A.6 Temporary git worktree cleanup

`git worktree list --porcelain` shows exactly one worktree (this repository's own working directory) and no `.git/worktrees/` entries beyond it. **No temporary worktree exists from Stage 2A or any earlier stage in this repository** — there was nothing to remove. (Sections of a broader master-reconciliation planning document, written in an earlier, separate investigation, described a hypothetical worktree-based verification strategy; no such worktree was ever actually created in this repository's real history, and none exists now.)

### A.7 `git diff --cached --name-status` note

Per this appendix's own verification pass: `git status --short` was clean at Stage 2B's start (confirmed against `checkpoint/stage-02a-user-admin-contract` = `5fac82d`); every `git diff --cached --name-status` check run during Stage 2B's own commit-staging steps was, by construction, a pre-commit snapshot (staged-but-not-yet-committed), and each commit was followed by a clean `git status --short` confirming the staging area was empty afterward — this is a process characteristic of how this task's own commits were made, not a new finding about Stage 2A's commits.
