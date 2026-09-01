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

## Status note (Stage 2C, 2026-09-01)

This contract's account-role model (§ above, and `src/utils/accountRoles.js`) is unchanged by Stage 2C — `user`/`admin` only, admin proven exclusively via `AdminAuthContext` + MFA, never via a regular account's `role` field. Stage 2C acted on a further product decision this contract did not itself make: parent-child account linking is out of scope entirely. It deleted `ParentDashboard.jsx`/`ChildModal.jsx` (left BLOCKED by Stage 2B per A.4 above) and the `getMyLinkCode()` UI this appendix references in A.2/A.4 as still-live at the time of writing — that UI no longer exists. It also fixed a real raw-role-display bug this appendix did not previously catch: `Header.jsx`'s mobile profile strip rendered the account's raw, unnormalized `role` field verbatim (`{user.role}`), which could show a legacy `"teacher"`/`"parent"`/`"student"` string for an old account; it now shows a generic translated label instead. The admin-session localStorage-spoof finding in A.2 is **unchanged and still stands**: server-side enforcement remains UNKNOWN, and this frontend guard is still not a substitute for it. Full detail: `docs/legacy-role-orphan-cleanup.md`.

## Appendix B (Stage 2C Final Corrective): the user/admin contract, actually closed

Stage 2C left three real gaps standing, each documented at the time but none actually fixed: (1) `normalizeAccountRole()` was described as the account-role contract's enforcement point but was **never called anywhere** outside its own test file — `user.role` could still literally hold a raw legacy value; (2) `isVerifiedAdminSession(adminUser) = Boolean(adminUser)` meant a cached `localStorage.adminUser` object, forged or merely stale, was by itself sufficient to render the Admin shell — fail-open, not fail-closed; (3) `AdminDashboard.jsx`/`AdminUsersTab.jsx`/`AdminClassesTab.jsx` still computed real KPIs and UI from `u.role === 'student'`/raw `u.role` display, explicitly logged as UNKNOWN/kept in `docs/legacy-role-orphan-cleanup.md` rather than resolved. This corrective closes all three.

### B.1 The final contract, stated plainly

- **Every regular account is `user`.** No `teacher`/`parent`/`student` account type exists. A public teacher *directory listing* (`Teachers.jsx`/`TeacherProfile.jsx`, static marketing content) is not a teacher *account* — the two concepts are unrelated and always were.
- **`admin` is the one distinguished type**, proven exclusively by `AdminAuthContext`'s own session-verification state (`sessionStatus`), never by any regular account's `role` field, and never by the mere presence of a cached object.
- **The regular `User` model and the `AdminUser` model are two entirely separate systems.** `GET /v1/admin/users` (backing `AdminUsersTab`/`AdminDashboard`) returns `User` rows only — it can never return an `AdminUser`. There is no code path anywhere in this app where a row from that endpoint should ever be treated as admin.
- The words `student`/`teacher`/`parent` remain legitimate **only** as product data (an Enrollment form's field name, a marketing page's copy) — never as an account-role comparison, a permission check, or a user-selection filter. The active-code sweep (`activeRoleSweep.test.js`, new) enforces this distinction: it forbids `role === 'student'|'teacher'|'parent'` as a comparison, but does not and should not forbid those words as data/content anywhere in `src/`.

### B.2 Regular user vs. AdminUser — the concrete difference now

| | Regular `user` (`AuthContext`) | `AdminUser` (`AdminAuthContext`) |
|---|---|---|
| Where the profile is cached | `localStorage.user` | `localStorage.adminUser` |
| Is the cache itself proof of anything? | No — `sessionChecked`/`ensureSession()` via `getMe()` govern trust | No — `sessionStatus` governs trust; the cache is a presentation hint only |
| What proves the session is real | A successful `getMe()`/`ensureSession()` round trip against the regular session cookie | `sessionStatus === 'verified'`, reached only via a real login+MFA response or `verifySession()` (see B.3) |
| Can this ever grant admin? | **Never.** `normalizeAccountRole()` forces `role: 'user'` unconditionally, at every boundary (see B.4) | N/A — this *is* the admin proof |

### B.3 Admin session: the fail-closed design, and its real proof boundary

**Endpoint inventory performed before design** (per the task's own instruction not to invent an unowned backend contract): `src/api/adminAuthApi.js` exports exactly `adminLogin`, `adminMfaSetup`, `adminMfaConfirm`, `adminMfaVerify`, `adminLogout`, `adminRefresh`. `artifacts/api-server` has no admin-auth logic of its own at all (`src/routes/` contains only health routes; `src/app.ts` is a pure reverse proxy to an external `academy-backend-cxso.onrender.com` origin for everything else) — so every one of these calls' real implementation lives entirely on that external, untracked Upstream, unverifiable from this repository. There is **no** `GET /v1/admin/auth/me`-style read-only "who am I" endpoint. The only call capable of confirming a session's current validity is `adminRefresh()` — already a real, already-production-exercised call (`adminHttp.js`'s own 401 interceptor already fires it reactively on every failed admin data call). This corrective does not invent a new contract; it triggers that same existing call **proactively at mount time** instead of only reactively after a failed data call, so the Admin shell never renders on an unverified cached profile in the first place.

**The design** (`AdminAuthContext.jsx`): a `sessionStatus` state machine — `'checking'` (a cached profile exists, not yet confirmed) → `'verified'` (confirmed) or `'unauthenticated'` (confirmed absent/invalid). `isAdmin` is now `sessionStatus === 'verified'`, full stop — never `Boolean(adminUser)`. `isChecking` is exposed so `ProtectedRoute`/`AdminSessionGate`/`AdminLogin` render nothing (not a redirect either direction) while a check is in flight, avoiding both a false bounce to `/admin/login` and the very fail-open flash this closes.

**A real race condition was found and fixed while writing this design's own tests** (not merely documented — see `test/AdminAuthContext.test.jsx`'s "epoch guard regression test"): a mount-time `verifySession()` call still in flight when `logout()` fires could resolve *after* logout and incorrectly resurrect `sessionStatus` to `'verified'`. Fixed with an epoch counter (`epochRef`) that `logout()` bumps; a `verifySession()` result is only applied if the epoch it started with is still current.

**Explicitly not done, and why:** a proactive refresh call was considered and rejected in the prior Stage 2B investigation over the (real, still-true) concern that `admin_rt` is one-time-use server-side and this repository cannot observe the real Upstream's behavior under repeated/concurrent refreshes. This corrective proceeds anyway because (a) the task explicitly directed closing this gap using whatever real, already-owned endpoint exists, (b) the call pattern is *identical* to production behavior already exercised today (same function, same cookie, same rotation), just triggered one step earlier in the lifecycle, and (c) the single-flight + epoch guards close the concurrency risk that was the actual, nameable danger. **What remains explicitly unverified:** whether the real Upstream's `admin_rt` rotation tolerates being called once per page load (vs. only after a failed data call) under real production traffic patterns — this cannot be proven without Remote access, and is logged as a production blocker below, not silently assumed safe.

**`isVerifiedAdminSession()`'s contract changed** (`src/utils/accountRoles.js`): it now takes `sessionStatus` (a string), not `adminUser` (an object), and returns `sessionStatus === 'verified'`. Every real call site (there was exactly one, `AdminAuthContext.jsx`) was updated; `test/accountRoles.test.js`'s old assertions that literally *documented* the fail-open behavior as intentional ("does not itself validate object shape...") are rewritten to assert the fail-closed contract instead.

### B.4 `normalizeAccountRole()` — now actually the enforcement point

`AuthContext.jsx` now applies `normalizeAccountRole()` at the single funnel (`persist()`) every public path goes through: cached-profile restoration on mount, `login()`, `register()`, `getMe()`/`ensureSession()`, and `updateProfile()`. No matter what a legacy/spoofed response claims (`admin`/`student`/`teacher`/`parent`/`null`/`undefined`/garbage), `user.role` is unconditionally `'user'` — proven directly, per boundary, in the new `test/AuthContext.test.jsx` (zero prior coverage before this corrective).

This closed one real, live bug the normalization gap had allowed: `Profile.jsx`'s account-type label used to read `user?.role === 'admin' ? roleAdmin : roleUser` directly off the unnormalized field — meaning an account whose raw legacy `role` still said `"admin"` would see **"Administrator"** on its own Profile page, despite that page having nothing to do with real admin identity. Fixed: Profile.jsx's regular-account label is now always the generic account-type string, with no admin branch at all — real admin identity belongs exclusively to `AdminAuthContext`/`AdminDashboard`, never to this page.

### B.5 AdminDashboard / AdminUsersTab / AdminClassesTab — resolved, not just logged

The three items `docs/legacy-role-orphan-cleanup.md` explicitly left as **UNKNOWN / reviewed-and-kept / out-of-scope** are resolved here:

- **`AdminDashboard.jsx`'s `students = users.filter(u => u.role === 'student')` KPI and its `listTeachers()`-backed "Teachers list" card** — both **deleted**. `listTeachers()` (`GET /v1/admin/users/teachers`) was a list of legacy *teacher accounts*, categorically unrelated to the public teacher directory (`Teachers.jsx`/`TeacherProfile.jsx`, static content, zero API dependency — confirmed by reading its imports). Replaced with real product fields already present on every user: `activeSubscribers = users.filter(u => u.subscription?.status === 'active')` drives "Active Subscribers" (renamed from "Active Students") and the conversion-rate KPI; the page-header subline now reads total users · active subscribers · pending payments — no invented numbers, only fields already computed elsewhere in the same file.
- **`AdminUsersTab.jsx`'s Role column (raw `{u.role}`) and Family column** — both **deleted**. Every row this table shows is, by definition, a `User`, never an `AdminUser` (see B.2) — there was nothing a "role" column could truthfully show. `familyName`/`setFamilyName` were investigated per the task's own evidentiary standard: zero product-scope documentation anywhere in `docs/`, zero consumer that ever read the field back for grouping/billing (write-only from the admin's own UI), and gated exclusively on the now-removed `u.role === 'student'` check — concluded to be an undocumented orphan of the deleted parent/student account model, not a real general-purpose field, and deleted (UI + the `setFamilyName` API export).
- **`AdminClassesTab.jsx`'s `users.filter(u => u.role === 'student')` picker** — **fixed, feature kept**. No documented or provable narrower eligibility exists for Live Classes participation, so the full `users` list is now the eligible pool (every regular account is `user`; no eligibility narrower than that is invented). Copy changed from "Student" to "Participant" throughout the file; the underlying `student`/`c.student` field/variable names are unchanged (a backend-contract rename is outside this corrective's scope). Live Classes itself was not evaluated for BLOCKED/DEFER status — the task's instruction to leave that undecided if reached was not triggered, since only the role-filter bug needed fixing to close this gap safely.

### B.6 API exports removed vs. deferred

**Removed** (all confirmed zero-consumer and tied to the deleted account-role model): `getMyLinkCode` (Stage 2C), `adminCreateUser`/`assignTeacher` (Stage 2C), and in this corrective — `listTeachers`, `updateUserRole`, `setFamilyName`. `updateUserRole` was already zero-consumer before Stage 2C too; it was left alone there only because it wasn't in that stage's named manifest — this corrective's own Part B.7 explicitly named it for review, and it meets the same deletion criterion the other two do, so it is removed now.

**Deferred, not touched** (frontend-only scope; no Remote/backend access at any point in this engagement): the real server-side existence/removal of `/v1/admin/users/teachers`, `/v1/admin/users/:id/role`, `/v1/admin/users/:id/family`, `/auth/link-code`, `/parent/*`, `/teacher/*` is entirely unknown from this repository. `preferred_teacher_key`/teacher-snapshot data in Enrollment, public teacher directory content, and Trial/Enrollment student/parent form field names were untouched by any change in this corrective — confirmed via the active-code sweep, which deliberately does not forbid those words as data.

### B.7 What remains DEFER/BLOCKED

- `ParentDashboard.jsx`/`ChildModal.jsx` — already resolved (deleted) in Stage 2C proper; not reopened here.
- Admin session server-side enforcement — **UNKNOWN**, unchanged. Fail-closed frontend behavior is not proof of backend enforcement; this contract has never claimed otherwise and does not start now.
- Whether the real Upstream's `admin_rt` refresh-rotation tolerates the new proactive mount-time call pattern under real traffic — **UNKNOWN**, explicitly logged in B.3, not assumed safe.
- `AdminUsersTab.jsx`'s subscription actions, `AdminDashboard.jsx`'s remaining tabs/KPIs, and Live Classes as a feature — all untouched, still standing on their pre-existing (unrelated) foundations.
- **Backend/Supabase wiring has not started.** `lib/db`'s 20-table Supabase-backed schema remains completely unconnected to this frontend; every admin/user API call in this corrective still targets the same legacy/external Upstream via `adminHttp`/`http`, unchanged. Nothing in this corrective is Supabase-aware, and none of the constraints against touching Supabase/SQL/migrations/`.env`/`backend/` were approached at any point.

### B.8 Corrections to `docs/legacy-role-orphan-cleanup.md`

That document is **not rewritten** — its findings were accurate for the state of the code *as it stood when written*. Three factual errors in its own bookkeeping are corrected here, by addition:

1. Its `test/Profile.test.jsx` entry (table under "Tests") says **"new, 5 tests"** — the file, as actually written and committed in that stage, had **4** `it()` blocks (render/generic-sections, no-link-code-section, generic-User-label, and the now-corrected-in-this-stage "shows Administrator" assertion). The count was miscounted by one at write time.
2. Its closing sentence on `u.role === 'student'` usages states *"the only remaining ... usages are **the two** explicitly logged UNKNOWN/kept items above"* — the table immediately above that sentence actually lists **three**: `AdminUsersTab.jsx`'s family-name gate, `AdminDashboard.jsx`'s KPI, and `AdminClassesTab.jsx`'s picker filter. The summary undercounted its own table by one.
3. Its static guard (`legacyRoleOrphanCleanup.test.js`) checked a hand-picked list of specific files one at a time — not a real sweep of `src/`. This corrective's `activeRoleSweep.test.js` (new) is the actual programmatic sweep: every `.js`/`.jsx` file under `src/` (excluding only `test/`) is walked and checked, so a guard titled "no import remains" now actually fails if that import reappears anywhere, not just in the one file a prior author remembered to check.

All three are corrected here as an appendix, per this engagement's standing discipline of never rewriting a prior stage's historical record.
