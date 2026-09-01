# Legacy Roles and Dashboard Reachability Audit

**Stage 2 Batch 2 — audit and documentation only. No implementation occurred.**

Starting SHA: `5275ebc687ae1955b351865cb6d46997a1948684`
Audit branch: `audit/legacy-roles-dashboard-reachability`
Date: 2026-08-31

---

## 1. Executive verdict

The database layer (`lib/db`) already implements the target `user`/`admin` contract exactly: `account_role` is a 2-value enum (`'user'`, `'admin'`), the `handle_new_user()` trigger unconditionally inserts `role='user'` and explicitly ignores any client-supplied `raw_user_meta_data` role claim, and promotion to `admin` is only possible through `admin_set_role()`, an AAL2-gated RPC (`lib/db/drizzle/0000_init_20_table_baseline.sql:14`, `0001_functions_triggers.sql:26-47`, `0002_rls.sql:584-610`, `lib/db/src/schema/enums.ts:10-12`). **Nothing needs to be built at the DB layer for the target contract — it is already correct.**

The gap is entirely in the **application layer**, and it is larger than a routing cleanup:

- The live frontend (`artifacts/al-rahma-academy`) still runs a full 4-role model (`student`/`teacher`/`parent`/`admin`) end to end: a public registration form with a client-side role selector (`Register.jsx:32,68-72`), role-based post-login routing (`Login.jsx:30`), role-derived UI booleans (`AuthContext.jsx:110-112`), a role-based route guard (`ProtectedRoute.jsx:32`), role-gated navigation in at least 5 separate places (`dashboardNav.js`, `Header.jsx`, `MobileBottomNav.jsx`, `CommandPalette.jsx`, `DashboardLayout.jsx`), and an admin UI that can set any user's `role` to `admin`/`teacher`/`parent`/`student` via a plain `<select>` (`AdminUsersTab.jsx:75-80`, `AdminStaffTab.jsx:31-34`).
- **None of this is wired to `lib/db`.** `artifacts/api-server` locally implements exactly one route (`GET /api/healthz`, `artifacts/api-server/src/routes/health.ts`) and proxies every other `/api/*` call — all 116 unique endpoint call sites the frontend makes, including every auth/role/dashboard endpoint — to an external, untracked upstream (`UPSTREAM_API_ORIGIN`, default `https://academy-backend-cxso.onrender.com`, `artifacts/api-server/src/app.ts:8-10,33-92`). `@workspace/db` is a declared but **never-imported** dependency of `api-server` (confirmed by `git grep`, zero import sites). Whatever actually enforces roles today is therefore **external and unverifiable from this repository**.
- A separate, better piece of news: the real admin-hardening story is not the general `role==='admin'` field at all. `/admin` is double-gated — `ProtectedRoute adminOnly` (checks `user.role==='admin'`) wraps `AdminSessionGate`, which requires a **wholly separate** `AdminUser` + TOTP-MFA session (`admin_at`/`admin_rt` cookies) for anything under `/api/v1/admin/*` (`AdminSessionGate.jsx:4-9`, `AdminAuthContext.jsx:8-12`). The role-promotion capability in `AdminUsersTab.jsx` is itself gated behind this hardened session (routes through `adminHttp`, `adminApi.js:5`), so it is not a bare open privilege-escalation hole — but it is real, reachable, and worth a HIGH-severity architectural note (Section 9).
- **A concrete, currently-live defect, independent of any role redesign**: `Dashboard.jsx` (the KEEP-scope, most-visited page for a regular user), `TeacherDashboard.jsx`, and `ParentDashboard.jsx` all read `t.dashboard.roles.<x>` and/or `t.dashboard.items.<x>` unconditionally in their page header (`Dashboard.jsx:201`, `TeacherDashboard.jsx:121,134,196,464-465`, `ParentDashboard.jsx:95,298-299`). `t.dashboard` (from `src/i18n/en.js`, `ar.js`, etc.) has **no** `roles` or `items` sub-key in any locale. This was proven directly (not inferred) by importing the real tracked `en.js`/`ar.js` modules in Node and evaluating the exact property chain — both throw `TypeError: Cannot read properties of undefined`. **`/dashboard`, `/teacher`, and `/parent` therefore crash on first render today**, caught only by the single top-level `<ErrorBoundary>` wrapping the whole app (`App.jsx:101`), in every locale. No test currently renders any of these three pages, which is why the 228/228 suite doesn't catch it. `MobileBottomNav.jsx`, `DashboardLayout.jsx`, `CommandPalette.jsx`, and `NotificationPanel.jsx` all correctly source the same copy from `getExperienceText(lang).dashboard` instead and are unaffected — this is a narrow, precisely-scoped, three-file bug, not a systemic one.

**Bottom line:** the role-model consolidation this audit was requested to plan is real, well-scoped, and mostly a frontend/legacy-backend problem — but it should not be scheduled ahead of, or without acknowledging, the independent `t.dashboard.roles`/`items` rendering crash, since Batch 2B (dashboard removal/merge) touches exactly these three files anyway.

---

## 2. Starting SHA and audit methodology

- Starting SHA: `5275ebc687ae1955b351865cb6d46997a1948684` (branch `feat/prune-attendance-homework` at the time this audit began; verified clean worktree, tag `checkpoint/stage-01-clean-baseline` → `ba1ec29d101c87e8e1dc9c70eb78822024e5ba9c`, matching).
- Audit branch `audit/legacy-roles-dashboard-reachability` created fresh from that SHA.
- Search tool: `git grep` (tracked files only) as the primary tool; every search explicitly excluded `.migration-backup/`, `node_modules/`, `dist/`, `coverage/`, `.git/` (and `backend/`, `frontend/`, `e2e/`, `.playwright-mcp/` do not exist as tracked paths at all post-Stage-1). No `.env` file was opened. `lib/db/.env.example`'s variable **name** (`DATABASE_URL`) was read; no value was read or printed anywhere in this audit.
- Two passes, as required: **Pass 1** (evidence inventory — file reads, `git grep`, and one direct Node ESM import of two tracked translation modules to prove a property-access crash, described above) collected raw citations before any KEEP/DELETE/MERGE decision was made; **Pass 2** (this document) cross-checked every decision below against actual import/route-registration/call-site evidence, not a single isolated grep match.
- Every `PRESENT IN REPOSITORY` claim below was confirmed by `git ls-files` or `git grep` against the Starting SHA. Every `WIRED INTO LOCAL RUNTIME` claim traces an explicit import, route registration, or call site. Every `DEPLOYED/REMOTE STATUS UNKNOWN` claim is stated as such because the real enforcement lives in an external, untracked service (the Render-hosted legacy backend) or in a database this repo has never connected to — this audit does not and cannot resolve that. `.migration-backup/` evidence is cited only as `HISTORICAL_ONLY`, never as proof of current behavior.

---

## 3. Canonical runtime boundaries

| Area | Canonical path | Repository status | Runtime wiring | Evidence | Notes |
|---|---|---|---|---|---|
| Frontend app | `artifacts/al-rahma-academy` | PRESENT, canonical (pnpm workspace member, `pnpm-workspace.yaml:44`) | WIRED — the only tracked SPA; built by `vite build`, calls `/api/*` | `artifacts/al-rahma-academy/vite.config.ts`, `src/App.jsx` | Confirmed already in Stage 1/2 Batch 1 work; unchanged here. |
| API gateway | `artifacts/api-server` | PRESENT, canonical | WIRED locally for exactly `GET /api/healthz`; every other `/api/*` path falls through to a generic reverse proxy | `artifacts/api-server/src/app.ts:1-97`, `src/routes/index.ts:1-9`, `src/routes/health.ts:1-12` | Declares `@workspace/db` as a dependency but never imports it (`git grep "@workspace/db" -- artifacts/api-server` → only `package.json`). |
| Upstream (legacy) backend | *(not in this repository)* | NOT PRESENT — external | DEPLOYED/REMOTE STATUS UNKNOWN | `UPSTREAM_API_ORIGIN` env var name, default `https://academy-backend-cxso.onrender.com` (`app.ts:8-10`) | This is where every real auth/role/dashboard endpoint's actual implementation lives today. Not inspectable from this repo. |
| Supabase schema/migrations | `lib/db` | PRESENT, canonical | **NOT WIRED** — zero live consumers (`api-server` never imports it; frontend never references `@supabase/supabase-js` anywhere — reconfirmed by this audit's `git grep`) | `lib/db/src/schema/*.ts`, `lib/db/drizzle/0000..0011*.sql` | Fully built, fully tested locally (`lib/db/test/`), never connected to the live app. |
| API contracts | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | PRESENT | `lib/api-zod` WIRED (imported by `api-server`'s `health.ts:2`); `lib/api-spec`/`lib/api-client-react` UNKNOWN — not inspected further, out of this audit's direct scope (no role content found) | `pnpm-workspace.yaml:44-46` | Named for completeness; role/dashboard content not found there. |
| Local rehearsal harness | `ops/option-a-rehearsal` | PRESENT, canonical for local Postgres rehearsal only | WIRED locally only (never against the real Supabase project) | `ops/option-a-rehearsal/` (Stage 0 evidence) | Not part of the live app boundary. |
| `.migration-backup/` | tracked, 667 files | PRESENT, **HISTORICAL_ONLY** | Not runtime — a frozen pre-migration snapshot | Stage 1 audit (`docs/repository-hygiene-baseline.md`) | Consulted twice in this audit (registration role-clamp logic) purely for historical context, never as proof of current behavior; not modified. |
| `attached_assets/`, `screenshots/`, `.agents/`, `.replit*`, root `replit.md` | tracked | PRESENT | Not part of app runtime (design assets, prior-agent memory, Replit tooling config) | `git ls-files` top-level listing | Out of scope for role/dashboard reachability; noted only for completeness of the boundary map. |

No folder was treated as an active app merely because it exists — each row above is evidence-backed per the rule in the task.

---

## 4. Current role model (summary — full matrix in §6)

Two co-existing, unrelated role systems exist today:

1. **Legacy 4-value `User.role`** (`student`/`teacher`/`parent`/`admin`) — lives entirely in the frontend + external upstream. Source of truth for `isAdmin`/`isTeacher`/`isParent` (`AuthContext.jsx:110-112`), for `ProtectedRoute`'s `role` prop check (`ProtectedRoute.jsx:32`), and for every nav/dashboard-link decision. Settable at public signup (`Register.jsx:32,68-72`, restricted in the visible UI to `student`/`parent`) and mutable by an admin to any of the 4 values including `admin` itself (`AdminUsersTab.jsx:75-80`).
2. **Hardened `AdminUser` + TOTP-MFA session** (`AdminAuthContext.jsx`) — a completely separate identity/session model, cookie-based (`admin_at`/`admin_rt`), gating `/api/v1/admin/*`. This is the system that actually protects admin API calls; the legacy `role==='admin'` field is only a frontend routing convenience layered on top.
3. **`account_role` (Postgres enum, `lib/db`)** — `'user'` / `'admin'` only. Already matches the target contract. Zero runtime connection to (1) or (2) today.

---

## 5. Target user/admin contract

(Restated from the task for traceability — not modified.) One self-service account type (`user`); one out-of-band elevated type (`admin`); no `teacher`/`parent`/`student` account types; public registration has no role choice; `user_metadata`/`app_metadata` cannot create an admin; trial/enrollment can be submitted without an account; paid checkout requires a registered `user`; profile, Quran bookmarks/progress/memorization, wishlist, notifications + preferences, subscription/billing views, and daily-reminder preferences are the account features to preserve; the public teacher directory, `preferred_teacher_key` in enrollment, and teacher names in content must not be confused with a "teacher account role"; a parent's name/child data inside a trial/enrollment form must not be confused with a "parent account role"; a student's name/age/level as enrollment data must not be confused with a "student account role."

---

## 6. Role definition matrix

`DECISION` uses the fixed vocabulary: KEEP / MERGE_INTO_USER / ADMIN_ONLY_KEEP / DELETE_PROPOSED / REDESIGN / DEFER / HISTORICAL_ONLY / UNKNOWN.

| Symbol/value | File:line | Layer | Read by | Written by | Runtime reachable? | Decision | Evidence |
|---|---|---|---|---|---|---|---|
| `User.role` field (`student`/`teacher`/`parent`/`admin`) | `AuthContext.jsx:110-112` (derivation); `Register.jsx:32,47,68-72`; `Login.jsx:30`; `AdminUsersTab.jsx:75-80`; `AdminStaffTab.jsx:4,31-34` | Frontend + external upstream | `AuthContext`, `ProtectedRoute`, `Header.jsx`, `dashboardNav.js`, `CommandPalette.jsx`, `Profile.jsx` | `authApi.registerUser`/`updateMe`; admin's `updateUserRole`/`adminCreateUser` | WIRED (frontend); enforcement UNKNOWN (external) | **DELETE_PROPOSED** (4-value model) → MERGE_INTO_USER for the surviving `user`/`admin` split | Above |
| `isAdmin`, `isTeacher`, `isParent` | `AuthContext.jsx:110-112` | Frontend | ~15 files (§ role-symbol search) | derived, read-only | WIRED | `isAdmin`: KEEP (rename/rebuild only); `isTeacher`/`isParent`: DELETE_PROPOSED | `git grep isTeacher\|isParent\|isAdmin` across `src/` |
| `adminOnly` prop / `role` prop on `ProtectedRoute` | `ProtectedRoute.jsx:15,31-32` | Frontend | `App.jsx:177-180` | n/a (route config) | WIRED | `adminOnly`: KEEP; `role="teacher"`/`role="parent"`: DELETE_PROPOSED | `App.jsx:179-180` |
| `AdminUser` / `adminUser` (separate model) | `AdminAuthContext.jsx:8-21,32-68`; `AdminSessionGate.jsx:10-22` | Frontend + external upstream (`/api/v1/admin/auth/*`) | `AdminSessionGate`, `AdminDashboard.jsx` (indirectly via `adminHttp`) | `adminLogin`/`adminMfaConfirm`/`adminMfaVerify` (`adminAuthApi.js`) | WIRED (frontend); enforcement UNKNOWN (external) | **ADMIN_ONLY_KEEP** — this is the real admin identity to build on | `AdminAuthContext.jsx` full file |
| `account_role` Postgres enum (`'user'`,`'admin'`) | `lib/db/drizzle/0000_init_20_table_baseline.sql:14`; `lib/db/src/schema/enums.ts:10-12` | DB | RLS policies, `admin_set_role()` | `handle_new_user()` trigger, `admin_set_role()` RPC | NOT WIRED to live app (no consumer) | **KEEP** (already correct; needs a live consumer, not a redesign) | `0001_functions_triggers.sql:26-47`, `0002_rls.sql:584-610` |
| `admin_set_role(uuid, account_role)` RPC | `lib/db/drizzle/0002_rls.sql:584-610` | DB | none yet (unwired) | requires AAL2-verified admin caller (`is_admin_aal2()`) | NOT WIRED | KEEP | Same file |
| `m.role` (AI Tutor chat message: `'user'`/`'assistant'`) | `AiTutor.jsx:139` | Frontend | AI Tutor conversation UI | AI Tutor API responses | WIRED, but **unrelated concept** | **KEEP as-is / out of scope** — not an account role | `.migration-backup/backend/controllers/aiTutorController.js:84,91,116` shows the same `'user'`/`'assistant'` chat-turn shape historically |
| `p.author.role` (blog post byline) | `Blog.jsx:126` | Frontend | Blog list rendering | Blog content (admin-authored) | WIRED, but **unrelated concept** | **KEEP as-is / out of scope** — a display label (e.g. "Content Writer"), not an account permission | `blogs.author_role text` column, `lib/db/drizzle/0000_init_20_table_baseline.sql:106` |
| `testimonials.author_role` (DB column) | `lib/db/drizzle/0000_init_20_table_baseline.sql:129` | DB | `Testimonials.jsx` (marketing) | admin-authored testimonial content | WIRED (DB), frontend consumer UNKNOWN (not traced further) | **KEEP as-is / out of scope** — free-text display label, not an enum, not tied to `account_role` | Same migration |
| `u.record.attendance` (per-record present/absent mark) | `StudentModal.jsx`, `ChildModal.jsx`, `AdminProgressModal.jsx` | Frontend | Teacher/parent/admin record views | teacher-entered record | WIRED | **KEEP as-is / out of scope** — already confirmed unrelated to the deleted Attendance *page* in Stage 2 Batch 1 | Batch 1 investigation, reconfirmed here |
| `'editor'` / RBAC permission (`users:read`) | Comment only, `AdminDashboard.jsx:188-191` | Frontend (comment), implies external `AdminUser` sub-roles | n/a — not branched on in frontend code | n/a | **Not implemented in frontend code** — describes assumed external behavior | UNKNOWN | No `'editor'` literal found anywhere in active frontend/DB code (`git grep -niE "editor|viewer|super-admin"` → only this comment + 2 DB doc comments explicitly excluding it) |
| `editor`/`viewer`/`super-admin` (DB doc comments) | `lib/db/src/schema/enums.ts:10`, `profiles.ts:9` | DB (comment only) | n/a | n/a | Explicitly **excluded** by design | HISTORICAL_ONLY (documents what was deliberately left out) | Same lines |

---

## 7. Route and redirect matrix

67 unique `<Route path=...>` patterns are registered in `App.jsx` (`grep -c '<Route path=' App.jsx` → 67). All routes below are directly registered (not inferred from navigation absence).

| Route | Component | Guard | Allowed role(s) | Entry points | Directly reachable? | Data/API dependencies | Decision | Evidence |
|---|---|---|---|---|---|---|---|---|
| `/dashboard` | `Dashboard.jsx` | `ProtectedRoute` (no role) | any logged-in user | nav, Header, MobileBottomNav, CommandPalette, post-login default | YES (route+guard) but **crashes on render** — see §1 | `courseApi`, `classApi`, `useDashboardData` (→ `/api/*`, proxied) | **KEEP** (fix crash + retarget as the single user landing page) | `App.jsx:170`; crash proof in §1 |
| `/billing` | `Billing.jsx` | `ProtectedRoute` | any logged-in user | dashboardNav (student list), Profile | YES | `paymentApi` (`/invoices`) | KEEP | `App.jsx:171` |
| `/wishlist` | `Wishlist.jsx` | `ProtectedRoute` | any logged-in user | dashboardNav (student list) | YES | `wishlistApi` | KEEP | `App.jsx:172` |
| `/ai-tutor` | `AiTutor.jsx` | `ProtectedRoute` | any logged-in user | dashboardNav (student list), Dashboard quick action | YES | `aiTutorApi` | DEFER (per existing product-scope-audit.md decision) | `App.jsx:173` |
| `/community` | `Community.jsx` | `ProtectedRoute` | any logged-in user | dashboardNav (student list) | YES | `communityApi` | DEFER (already CUT per product-scope-audit.md; not this audit's decision to re-litigate) | `App.jsx:174` |
| `/profile` | `Profile.jsx` | `ProtectedRoute` | any logged-in user | Header, MobileBottomNav | YES | `authApi.getMe/getMyLinkCode`, `courseApi` | KEEP | `App.jsx:175` |
| `/messages` | `Messages.jsx` | `ProtectedRoute` | any logged-in user | dashboardNav (all roles), Header | YES | `messageApi` | DEFER (already CUT per product-scope-audit.md) | `App.jsx:176` |
| `/admin/login` | `AdminLogin.jsx` | `ProtectedRoute adminOnly` | `role==='admin'` (legacy field) | direct link only | YES | `adminAuthApi.adminLogin` | REDESIGN — should not depend on the legacy `role` field at all; a login page should not require being pre-authenticated as anything | `App.jsx:177` |
| `/admin` | `AdminDashboard.jsx` | `ProtectedRoute adminOnly` **+** `AdminSessionGate` | `role==='admin'` **and** valid `AdminUser`+MFA session | Header, MobileBottomNav, CommandPalette (role-filtered) | YES | `adminApi`, `paymentApi`, `contentApi`, `reviewApi`, `communityApi` (all proxied) | **ADMIN_ONLY_KEEP** (rebuild outer guard around `AdminUser` alone, drop the legacy `role` layer) | `App.jsx:178` |
| `/teacher` | `TeacherDashboard.jsx` | `ProtectedRoute role="teacher"` | `role==='teacher'` (admin bypass) | dashboardNav (teacher list), Header, MobileBottomNav, CommandPalette | YES (route+guard) but **crashes on render** — see §1 | `teacherApi`, `courseApi`, `classApi` (proxied) | **DELETE_PROPOSED** | `App.jsx:179`; crash proof in §1 |
| `/parent` | `ParentDashboard.jsx` | `ProtectedRoute role="parent"` | `role==='parent'` (admin bypass) | dashboardNav (parent list), Header, MobileBottomNav, CommandPalette | YES (route+guard) but **crashes on render** — see §1 | `parentApi`, `classApi` (proxied) | **DELETE_PROPOSED** | `App.jsx:180`; crash proof in §1 |
| `/calendar` | `CalendarPage.jsx` | `ProtectedRoute` | any logged-in user | dashboardNav (teacher+student lists) | YES | `classApi` | DEFER (already CUT per product-scope-audit.md) | `App.jsx:181` |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | `Login.jsx`, `Register.jsx`, etc. | none (public) | n/a | Header, direct link | YES | `authApi` | `/register`: **REDESIGN** (remove the role `<select>`, §9); others KEEP | `App.jsx:159-162` |
| Public marketing/courses/tools/resources/academy routes (~35 patterns) | various | none (public) | n/a | primary nav | YES | mostly static or public API | KEEP — out of role-model scope, no role dependency found | `App.jsx:117-156` |
| Legacy flat-URL redirects (12 patterns) | `Navigate` | none | n/a | old bookmarked links | YES | none | KEEP — unrelated to roles | `App.jsx:184-196` |
| `*` (wildcard) | `NotFound.jsx` | none | n/a | any unmatched path, incl. deleted `/attendance`/`/homework` (Stage 2 Batch 1) | YES | none | KEEP | `App.jsx:199` |

No locale-prefixed duplicate routes exist anywhere (e.g. `/fr/teacher`) — the app mounts one flat `<Routes>` tree under a single `<BrowserRouter basename>` computed once from the URL path prefix (`main.jsx:41,56`); there is no per-locale route registration to check separately.

---

## 8. Dashboard reachability matrix

| Dashboard/component | Reachability | Data source | Mock/fallback? | Backend ownership | Useful functionality | Decision | Evidence |
|---|---|---|---|---|---|---|---|
| `Dashboard.jsx` (generic/student) | Route-reachable, **render-crashes** (§1) | `courseApi`, `classApi`, `useDashboardData` hook, all via proxied `/api/*` | No explicit mock; real (proxied) API calls | External, UNKNOWN | Progress ring, certificates, referral card, wishlist button, weekly chart, upcoming classes, spiritual pulse, daily wisdom, smart planner, hifz progress, tutor reviews — a large amount of real, worth-preserving UI | **KEEP, fix crash, this becomes THE single `user` landing page** | `Dashboard.jsx:1-40,197-225`; 899 lines total |
| `TeacherDashboard.jsx` | Route-reachable, **render-crashes** (§1) | `teacherApi.getMyStudents`, `courseApi.getCourses`, `classApi.getClasses` | No | External, UNKNOWN | Student roster, live-class scheduling, per-student records (via `StudentModal`) | **DELETE_PROPOSED** | `TeacherDashboard.jsx:1-30` |
| `ParentDashboard.jsx` | Route-reachable, **render-crashes** (§1) | `parentApi.getMyChildren/linkChild/unlinkChild`, `classApi.getClasses` | No | External, UNKNOWN | Child linking, weekly report, child progress (via `ChildModal`) | **DELETE_PROPOSED** | `ParentDashboard.jsx:1-25` |
| `AdminDashboard.jsx` | Route-reachable, double-guarded (§7), renders correctly (does not touch the broken `t.dashboard.roles/items` path — confirmed by absence in `git grep "t\.dashboard\." AdminDashboard.jsx`) | `adminApi`, `paymentApi`, `contentApi`, `reviewApi`, `communityApi` (all proxied) | No | External, UNKNOWN | 9 in-page tabs: 4 already-KEEP (`AdminUsersTab`, `AdminPaymentsTab`, `AdminTrialsTab`, `AdminNewsletterTab`) + 5 already-CUT per `docs/product-scope-audit.md` (`AdminStaffTab`, `AdminClassesTab`, `AdminCoursesTab`, `AdminReviewsTab`, `AdminCommunityTab`) | **ADMIN_ONLY_KEEP** shell; tab-level decisions already made in `product-scope-audit.md`, reconfirmed here, not re-litigated | `AdminDashboard.jsx:1-30`, `product-scope-audit.md` §1 |
| Generic "dashboard shell" (`DashboardLayout.jsx`) | Shared by all 4 dashboards above + `Profile`/`Billing`/`Wishlist`/etc. | `getExperienceText(lang).dashboard` (the **correct**, non-crashing source) | No | n/a (layout only) | Sidebar, nav, notification bell, role label — must be rebuilt for 2-role model, not deleted | **KEEP, rebuild role branches** | `DashboardLayout.jsx:35-38,79-80,271,380,415-417` |
| Role switcher | **Not found** — no UI lets a logged-in user change their own role | n/a | n/a | n/a | n/a | n/a | `git grep` found no role-switcher component |

No dashboard was proposed for deletion on the strength of its name alone — `TeacherDashboard.jsx`/`ParentDashboard.jsx` are proposed for deletion because (a) their entire route is scoped to a role being removed, (b) their real functionality (student roster/records, child linking) has no `user`/`admin` target owner identified anywhere in the target contract, and (c) they are currently non-functional regardless (§1 crash). `Dashboard.jsx` is explicitly **not** proposed for deletion — it has real, useful functionality that must survive as the unified `user` landing page.

---

## 9. API endpoint ownership matrix

116 unique `METHOD + normalized-path` call sites exist across `artifacts/al-rahma-academy/src/api/*.js` (26 files; count reproduced via `git grep -hoE "(http|adminHttp)\.(get|post|put|patch|delete)\(..." -- src/api/*.js | sort -u | wc -l`). `api-server` locally implements **one** route (`GET /healthz`, mounted under `/api` → `GET /api/healthz`). Every other call — **all 115 remaining** — falls through `app.ts`'s catch-all to the external upstream.

Representative rows (full list is mechanically reproducible from the count above; grouping by concern rather than listing all 116):

| Method/path (representative) | Frontend caller | Local server path | Proxy/upstream ownership | Auth enforcement | Storage/model | Runtime classification | Decision | Evidence |
|---|---|---|---|---|---|---|---|---|
| `GET /api/healthz` | none (ops/monitoring) | `routes/health.ts:6-9` | n/a | none | none (static response) | **LOCAL_IMPLEMENTATION_REACHABLE** | KEEP | `app.ts:33`, `routes/health.ts` |
| `POST /api/auth/register` | `authApi.js:3` | none | proxied to `UPSTREAM_API_ORIGIN` | UNKNOWN (external) | UNKNOWN | **PROXY_OR_GATEWAY_ONLY** (impl. `UPSTREAM_EXTERNAL_UNVERIFIED`) | REDESIGN (must become a Supabase Auth call, or a new local `api-server` handler using `lib/db`) | `app.ts:35-92`; sends the client's raw `role` field (§1) |
| `POST /api/auth/login`, `GET/PUT /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/forgot-password`/`reset-password`, `GET /api/auth/link-code`, `POST /api/auth/google` | `authApi.js:4-11` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | REDESIGN (same auth rebuild) | same |
| `POST/GET/PATCH/DELETE /api/v1/admin/auth/*` (login, mfa/setup, mfa/confirm, mfa/verify, logout, refresh) | `adminAuthApi.js` (via `adminApi.js`/`adminHttp.js`) | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | ADMIN_ONLY_KEEP (rebuild against a real, local, verified implementation before Batch 2E) | `adminHttp.js:1-16` |
| `GET/PATCH/POST /api/v1/admin/users*` (incl. `/:id/role`, `/:id/teacher`, `/:id/family`, `/:id/subscription`) | `adminApi.js:3-9` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | `/role` and `/teacher` PATCH: DELETE_PROPOSED (teacher/parent role assignment goes away); user list + subscription mgmt: ADMIN_ONLY_KEEP | `adminApi.js` full file |
| `GET /api/teacher/students*`, `POST /api/teacher/students/:id/records`, `DELETE /api/teacher/records/:id` | `teacherApi.js` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | DELETE_PROPOSED | grep table §7 evidence |
| `POST /api/parent/link`, `GET /api/parent/children*`, `DELETE /api/parent/children/:id` | `parentApi.js` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | DELETE_PROPOSED (unless the parent-child *linking* concept itself is redesigned as a `user`-scoped feature — flagged as an open dependency in §13, Batch 2B) | same |
| `GET/POST/PUT /api/quran-bookmarks*`, `/api/quran-progress*`, `/api/quran-memo*` | `quranBookmarkApi.js`, `quranProgressApi.js`, `quranMemoApi.js` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | **KEEP** — target-contract preserved features (§10) | grep table §7 evidence |
| `GET/POST/PATCH/DELETE /api/wishlist*` | `wishlistApi.js` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | KEEP | same |
| `GET/PATCH/DELETE /api/notifications*` | `notificationApi.js` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | KEEP | same |
| `GET /api/invoices` | `paymentApi.js:18` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | KEEP | same |
| `POST /api/enrollments`, `GET /api/enrollments/mine`, `GET /api/enrollments` (admin) | `enrollmentApi.js` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | KEEP — target contract §5-6 explicitly requires enrollment/trial without an account for the public form, and a registered `user` for paid checkout | same |
| `GET/POST/DELETE /api/community/*`, `/api/messages/*`, `/api/classes*` (calendar) | `communityApi.js`, `messageApi.js`, `classApi.js` | none | proxied | UNKNOWN | UNKNOWN | PROXY_OR_GATEWAY_ONLY | DEFER — tied to already-CUT/DEFER features (Community, Messages, Calendar) per `product-scope-audit.md`, not re-decided here | same |

No endpoint above is claimed to have a verified external implementation — "PROXY_OR_GATEWAY_ONLY" describes only the local routing fact (api-server passes it through); what the upstream actually does with it is `UNKNOWN` in every case except where `.migration-backup` was explicitly consulted as historical evidence (§1, registration role clamp).

**Environment variable names referenced (values never read):** `UPSTREAM_API_ORIGIN` (`app.ts:9`), `VITE_API_URL` (`http.js:4`, `adminHttp.js:5`), `VITE_GOOGLE_CLIENT_ID` (`Login.jsx:12`), `DATABASE_URL` (name only, from `lib/db/.env.example`).

---

## 10. Auth flow

**Registration → landing, evidence-traced:**

1. Visitor opens `/register` (public, no guard). Form defaults to `{ role: 'student' }` and offers a `<select>` with `student`/`parent` options (`Register.jsx:32,68-72`).
2. Submit calls `register(form)` → `AuthContext.register` → `registerUser(info)` → `POST /api/auth/register` with the full form body **including the client-chosen `role`** (`AuthContext.jsx:86-90`, `authApi.js:3`).
3. This request is proxied to the external upstream (§9) — **this repository cannot verify what the live upstream does with the `role` field.** Historical evidence only: `.migration-backup/backend/controllers/authController.js:76` shows the old Express handler used to whitelist-clamp it (`const safeRole = role === 'parent' ? 'parent' : 'student'`) — i.e., the *design intent* was already safe (a client could never self-register as `admin`/`teacher` even by crafting a raw POST body), but this is `HISTORICAL_ONLY` evidence, not proof of the currently-deployed behavior.
4. On success, the returned profile is cached (`localStorage['user']`) and the app navigates to `/parent` if `form.role==='parent'`, else `/dashboard` (`Register.jsx:47`) — **this navigation trusts the client's own submitted `role` value, not even the server's response**, a second, independent instance of the same "client role assumption" pattern, worth noting separately from step 3's server-trust question.
5. `AuthContext` derives `isAdmin`/`isTeacher`/`isParent` from `user?.role` (`AuthContext.jsx:110-112`) — this is what every guard and nav decision reads from that point on.

**Login → landing:** `POST /api/auth/login` → cache profile → `goToRole()` maps `{admin:'/admin', teacher:'/teacher', parent:'/parent'}[user?.role] || '/dashboard'`, then applies a same-origin-only redirect override if one was requested (`Login.jsx:29-34`, `utils/safeRedirect.js`).

**Session restoration:** on mount, if a cached profile exists, `ensureSession()` calls `GET /api/auth/me` to reconcile (`AuthContext.jsx:75-78`); `ProtectedRoute` independently triggers the same check for a visitor with no cache but a possibly-still-valid cookie (`ProtectedRoute.jsx:23-25`) — sound design, but the actual session cookie's issuance/verification is entirely server-side and `UNKNOWN`.

**Role rejection:** `ProtectedRoute`'s `role` check redirects to `/` (home), not to any error page, if the logged-in user's role doesn't match and they aren't admin (`ProtectedRoute.jsx:32`). `AdminSessionGate` redirects to `/admin/login` if no hardened `AdminUser` session exists (`AdminSessionGate.jsx:13-20`).

**Logout:** `POST /api/auth/logout` (best-effort — errors are swallowed since local state is cleared regardless), then `queryClient.clear()` + cache clear (`AuthContext.jsx:92-97`). Admin logout is the same pattern against `/api/v1/admin/auth/logout` (`AdminAuthContext.jsx:59-62`).

**Password reset:** `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` (`authApi.js:8-9`) — both proxied, `ForgotPassword.jsx`/`ResetPassword.jsx` matched the role-symbol grep only via unrelated ARIA/other text, no role logic found in either.

**Admin elevation:** two distinct paths — (a) `admin_set_role()` DB RPC, AAL2-gated, **unwired** to the live app (§6); (b) the frontend's `updateUserRole()` against the legacy `role` field, gated behind the hardened `AdminUser`+MFA session (`AdminUsersTab.jsx:75-80`, `adminApi.js:5`) — real, reachable, but sets a field the target contract doesn't want to exist as a client-writable value at all (§9 finding, HIGH severity, §12).

**Direct evidence answers to the task's specific auth questions:**

| Question | Answer | Evidence |
|---|---|---|
| Does registration send `role`/`accountType`? | Yes, `role` | `Register.jsx:32,46` |
| Can general metadata claim `admin`/`teacher`/`parent`/`student`? | At the **DB** layer: no — `handle_new_user()` ignores `raw_user_meta_data` entirely (`0001_functions_triggers.sql:26-47`). At the **legacy/frontend** layer: `UNKNOWN` for the live upstream; `HISTORICAL_ONLY` evidence says no (§ above) |
| Source of truth for role? | `user.role` from the `GET /api/auth/me` response, external and unverified | `AuthContext.jsx:110-112` |
| JWT, profile, API, or localStorage? | Cached profile in `localStorage`, refreshed from `/api/auth/me`; no JWT parsing found client-side | `AuthContext.jsx:14-21,50-66` |
| Multiple copies of the role that could disagree? | Yes — the cached `localStorage['user'].role` vs. whatever the server currently has; `Register.jsx:47`'s own-submitted-value navigation vs. the persisted server response, are two separately-derived values that could disagree if the server clamps the role differently than what was submitted | `Register.jsx:46-47` |
| Missing/unsupported role behavior? | Falls through every ternary to the default branch (`|| '/dashboard'`, `dashboardNav.js`'s final unconditional `return`) — fails to the least-privileged branch, not an elevated one | `Login.jsx:30`, `dashboardNav.js:51` |
| Fallback granting more than `user`? | None found | — |
| UI to change role (self-service)? | None found | — |
| Route relying only on a frontend guard? | **All of them** — `ProtectedRoute`/`AdminSessionGate` are pure client-side; real enforcement is external and unverified | `ProtectedRoute.jsx`, `AdminSessionGate.jsx` |
| Does `AdminDashboard` depend on the old role model? | Partially — reached via legacy `adminOnly` check, but its actual data calls are gated by the separate `AdminUser` session | `App.jsx:178` |
| Supabase Auth or legacy API/JWT? | **Legacy API via proxy** — zero `@supabase/supabase-js` usage found anywhere in tracked frontend code (reconfirmed by this audit) | `git grep -r "@supabase/supabase-js" -- artifacts` → no matches |

---

## 11. DB/RLS wiring and mismatch matrix

| DB object | Roles referenced | Schema/migration status | Runtime wiring | Target contract | Mismatch | Future action | Evidence |
|---|---|---|---|---|---|---|---|
| `account_role` enum (`'user'`,`'admin'`) | user, admin | Versioned (`0000`) | Local DB tests only; zero app consumers | Exact match | **None** | Wire `api-server`/frontend to it (Batch 2D) | `0000_init_20_table_baseline.sql:14` |
| `profiles.role` column | user, admin | Versioned (`0000`) | Local tests only | Exact match | None | Same | `0000_init_20_table_baseline.sql:187` |
| `handle_new_user()` trigger | forces `role='user'`, ignores metadata | Versioned (`0001`) | Local tests only (`schema.local.test.mjs`, `rls.local.test.mjs`) | Exact match | None | Same | `0001_functions_triggers.sql:26-47` |
| `admin_set_role(uuid, account_role)` RPC | requires AAL2 admin caller | Versioned (`0002`) | Local tests only | Exact match | None | Same | `0002_rls.sql:584-610` |
| `is_admin_aal2()` | admin, AAL2 | Versioned (`0002`) | Local tests only | Exact match | None | Same | `0002_rls.sql:32` |
| RLS policies (all 20 tables) | anon, authenticated, admin (via `is_admin_aal2()`), service_role | Versioned (`0002`–`0011`) | Local tests only, never against the real project (Stage 9 of the master plan, still gated) | Exact match | None at the design level; **Remote application status is separately gated and unrelated to this audit** | Unchanged — still requires explicit future authorization | `0002_rls.sql` full file |
| `blogs.author_role` / `testimonials.author_role` | free-text display label | Versioned (`0000`) | Frontend consumer for `testimonials` UNKNOWN (not traced), `blogs` via `Blog.jsx:126` | N/A — not an account-role concept | None | No action needed | `0000_init_20_table_baseline.sql:106,129` |
| Legacy Mongo `User.role` (`student`/`teacher`/`parent`/`admin`) | 4 values | **Not in `lib/db` at all** — lives only in `.migration-backup` (historical) and the external upstream | Frontend-wired via proxy; DB-side UNKNOWN (external Mongo, not this repo's Postgres) | Direct conflict — target wants 2 values | **This is the entire mismatch** | Batch 2A/2B/2D | `.migration-backup/backend/controllers/authController.js` (historical); no Postgres equivalent exists |

The DB tests (`lib/db/test/rls.local.test.mjs`, `rls-full-matrix.local.test.mjs`, `schema.local.test.mjs`, `upgrade-scenario.local.test.mjs`) were checked directly for any teacher/parent/student role usage: **none found** — the only `parent` matches are `parent_payment_id` (a refund's parent-payment relationship), an unrelated concept (`schema.local.test.mjs:390,753`). The DB layer's test suite is already fully aligned with the 2-role target and needs no role-related changes.

The claim "the site uses Supabase/RLS" is **not** made on the strength of `lib/db` existing — it is explicitly `NOT WIRED` per §3 and this section; RLS is real and tested, but only against a local Postgres instance, never the live app or the real project.

---

## 12. Preserved account-feature matrix

| Feature | Current UI | API/DB | Requires login? | Current role dependency | Target owner | Decision | Missing wiring | Evidence |
|---|---|---|---|---|---|---|---|---|
| Profile | `Profile.jsx` | `authApi.getMe/updateMe/getMyLinkCode`, `courseApi` (proxied) | Yes | None found (works for any role) | `user` | KEEP | Real backend, not proxy | `Profile.jsx:1-13` |
| Quran bookmarks | `useQuranBookmarks.js` hook | `quranBookmarkApi.js` (proxied) | Yes | None | `user` | KEEP | Real backend | `quranBookmarkApi.js` |
| Quran reading progress | `useQuranProgress.js` (implied by `quranProgressApi.js`) | `quranProgressApi.js` (proxied) | Yes | None | `user` | KEEP | Real backend | `quranProgressApi.js` |
| Quran memorization stats | `useQuranMemoStats.js`, `useQuranHifz.js` | `quranMemoApi.js`, `courseApi.js:17-19` (`/hifz*`) (proxied) | Yes | None | `user` | KEEP | Real backend | `quranMemoApi.js`, `courseApi.js` |
| Wishlist | `Wishlist.jsx`, `WishlistButton.jsx`, `useWishlist.js` | `wishlistApi.js` (proxied) | Yes | None | `user` | KEEP | Real backend | `wishlistApi.js` |
| Notifications | `NotificationPanel.jsx` | `notificationApi.js` (proxied) | Yes | None (correctly uses `getExperienceText`, no crash) | `user` | KEEP | Real backend | `NotificationPanel.jsx:1-6` |
| Notification preferences | Not found as a distinct UI — only mark-read/read-all found | `notificationApi.js:5-6` | Yes | None | `user` | **UNKNOWN** — no dedicated preferences UI located; flag for Batch 2D scoping | No further evidence found |
| Subscription/billing views | `Billing.jsx` | `paymentApi.js:18` (`/invoices`) | Yes | None | `user` | KEEP | Real backend | `Billing.jsx` route, `paymentApi.js` |
| Daily reminder preferences | **Not found** as a distinct UI/API surface | — | — | — | — | **UNKNOWN** — no evidence located anywhere in tracked frontend/DB code for a "daily reminder preference" as such (Adhkar/prayer-time tools exist but are not account-scoped preferences) | `git grep -i "reminder"` found no dedicated preference model |
| Certificates | `CertificateCard.jsx`, `Profile.jsx` (print), `Dashboard.jsx` | `courseApi.js:23,26` (`/certificates*`) (proxied) | Yes | None | `user` | KEEP (already decided KEEP-with-edits in `product-scope-audit.md`, reconfirmed here) | Real backend | `courseApi.js` |
| Parent-child link code | `Profile.jsx` (`getMyLinkCode`), `parentApi.js` | `/auth/link-code`, `/parent/link`, `/parent/children*` (proxied) | Yes | Tied to the `parent` role concept being removed | **UNKNOWN / DEFER** — whether any parent-child linking survives at all is a product decision outside this audit's authority; flagged as an explicit Batch 2A/2B dependency, not decided here | Depends on that decision | `parentApi.js`, `Profile.jsx` |

No feature above was cleared for deletion just because it sits near role-related code — every KEEP row traces its own dedicated API client with no role dependency, distinct from the teacher/parent/student dashboards proposed for deletion in §8.

---

## 13. Admin security findings (risk-ranked; not fixed in this task)

| # | Finding | Risk | Evidence |
|---|---|---|---|
| 1 | `POST /api/auth/register` (and every other `/api/*` call) is proxied to an external, untracked upstream whose actual role-enforcement code this repository cannot see or verify. The frontend sends a raw, client-chosen `role` field on public signup. | **HIGH** (not CRITICAL — historical evidence suggests the old handler safely clamped it, but current live behavior is unverifiable, and the frontend itself independently trusts the client value for its own post-signup redirect, `Register.jsx:47`) | `Register.jsx:32,46-47`, `authApi.js:3`, `app.ts:33-92` |
| 2 | An admin can set any user's `role` to `admin`/`teacher`/`parent`/`student` via a plain `<select>` (`AdminUsersTab.jsx:75-80`), calling `PATCH /api/v1/admin/users/:id/role`. This capability is properly gated behind the hardened `AdminUser`+MFA session (routes via `adminHttp`) — not a bare hole — but it is a second, independent, legacy-shaped admin-promotion path that the target contract's "admin promotion is an internal, safe-only process" (already correctly implemented as `admin_set_role()` in `lib/db`) does not intend to keep in this shape. | **MEDIUM** | `AdminUsersTab.jsx:75-80`, `adminApi.js:5` |
| 3 | `/dashboard`, `/teacher`, `/parent` crash on render in every locale (§1) — not a security hole, but a functional integrity gap directly touching the exact translation object (`t.dashboard`) that role-model consolidation work will also need to touch. | **HIGH** (functional, flagged here because it blocks safely validating anything else about these three pages by inspection alone — no automated test currently proves what they'd otherwise do) | Node ESM import proof, §1 |
| 4 | `/admin/login` requires `ProtectedRoute adminOnly`, i.e. **already being `role==='admin'`**, to reach a page whose entire purpose is authenticating as admin. This is backwards for any visitor who is not already a legacy-role admin but has valid `AdminUser` credentials, and depends on a role field the target contract wants to retire. | **MEDIUM** | `App.jsx:177` |
| 5 | No dedicated `AuthContext.test.jsx` or `ProtectedRoute` test exists — the entire legacy-role authorization surface is currently untested (§14). | **MEDIUM** (raises the risk of any future silent regression, not a live vulnerability by itself) | `git grep` test inventory, §14 |
| 6 | AAL2/MFA is real and DB-enforced for the RPCs that matter (`admin_set_role`, `issue_invoice_from_payment`, etc. — confirmed in Stage 0/earlier RLS work) but **unverified for the live external upstream's own admin session** (`admin_at`/`admin_rt` cookies, TOTP) since that code is not in this repository. | **LOW** for this audit (no new evidence of a problem — simply unverifiable) | `AdminAuthContext.jsx:8-12` |

None of these were fixed in this task, per its explicit read-only scope.

---

## 14. Test inventory and coverage gaps

33 test files exist in `artifacts/al-rahma-academy/src/test/` (post Stage 2 Batch 1). 14 reference role-related terms (`git grep`):

| Test file | What it proves | Role dependency | Keep/update/delete proposal | Coverage gap | Evidence |
|---|---|---|---|---|---|
| `AdminAuthContext.test.jsx` | `AdminUser`+MFA login/session persistence | Hardened admin model | KEEP | None significant | uses `role: 'admin'` only as fixture data on the *legacy* User shape for one case (`:66`), not testing that field's authorization |
| `AdminDashboard.test.jsx` | AdminDashboard renders/tab behavior | Legacy `role` indirectly (via mocked auth) | UPDATE once tabs are pruned per `product-scope-audit.md` | Doesn't test the `adminOnly` + `AdminSessionGate` double-guard directly | — |
| `AdminLogin.test.jsx` | Admin login flow | Hardened admin model | KEEP | — | `:91` |
| `AdminReviewsTab.test.jsx` | One already-CUT admin tab | n/a | DELETE alongside the tab (already decided) | — | — |
| `AdminSessionGate.test.jsx` | Gate redirect behavior | Hardened admin model | KEEP | — | `:74` |
| `CalendarPage.helpers.test.js` | Pure helper functions, no role content beyond incidental text match | none | KEEP (unrelated to this audit) | — | — |
| `CertificateCard.security.test.jsx` | Certificate rendering security | none (role match is incidental: "Certificate of Attendance" type) | KEEP | — | — |
| `CourseReviews.test.jsx`, `TutorReviewWidget.test.jsx` | Review UI | none (role match incidental — teacher as content, not account) | KEEP | — | — |
| `QuranMushafPage.a11y.test.jsx`, `ResourceModal.a11y.test.jsx` | Accessibility; role match is the ARIA attribute, not account role | none | KEEP (false-positive matches) | — | — |
| `WishlistButton.test.jsx`, `useSearch.test.jsx` | Feature tests; incidental role-word matches only | none | KEEP | — | — |
| `removed-lms-routes.test.js` | Attendance/Homework routes stay removed (Stage 2 Batch 1) | none (explicitly scoped away from roles) | KEEP | — | this audit's own predecessor |

**No test file exists for:** `AuthContext.jsx` (registration/login/role-derivation), `ProtectedRoute.jsx` (guard logic), `Register.jsx`/`Login.jsx` (the actual role-selection/role-routing behavior), `TeacherDashboard.jsx`/`ParentDashboard.jsx`/`Dashboard.jsx` (none render — which is exactly why the crash in §1 went uncaught), `dashboardNav.js`'s `navFor`/`bottomNavFor` in isolation (only indirectly exercised by `removed-lms-routes.test.js`'s narrow guard).

**Tests required before any Batch 2A/2B implementation** (per the task's explicit list, confirmed necessary by this audit's findings — not written here):
- Public signup always creates a `user` (never `admin`, never a legacy `teacher`/`parent`/`student` value) regardless of any spoofed request-body field.
- A crafted/spoofed metadata or request-body role claim cannot elevate privilege (covers both DB `handle_new_user()` — already provable locally — and, once rebuilt, the frontend/API-server registration path).
- A generic authenticated landing route exists and is reachable without a role check.
- `/admin` (or its replacement) is restricted to the hardened admin identity only, independent of any legacy `role` field.
- An unsupported/missing/malformed role value fails safely (does not grant elevated access) — the current `|| '/dashboard'` fallback pattern in `Login.jsx:30` and `dashboardNav.js:51` is evidence this already fails to the least-privileged branch, but is unverified in either an automated test.
- No `teacher`/`parent`/`student` account routes remain reachable.
- No stale teacher/parent-role navigation entries remain in any nav list.
- Every preserved account feature (§12 KEEP rows) stays reachable after the role consolidation.
- Direct reload and logout behavior for both `user` and `admin` sessions.
- The DB/RLS `user`/`admin` contract itself (already covered locally by `lib/db/test/`, per §11 — re-run, not re-written, once a real consumer exists).

---

## 15. Translation/content classification

Categories used: ACCOUNT_ROLE_COPY / PUBLIC_EDUCATIONAL_CONTENT / FORM_DATA_LABEL / ADMIN_CONTENT / ORPHANED / UNKNOWN.

| Key(s) | File(s) | Classification | Notes |
|---|---|---|---|
| `authPg.profile.accountType` | `en.js` (and 5 other locales, same line pattern) | FORM_DATA_LABEL | Register.jsx's role-select label — becomes ORPHANED once the selector is removed (§9 REDESIGN) |
| `authPg.profile.roleStudent`, `roleParent`, `roleTeacher`, `roleAdmin` | `en.js:677-679,701` (+5 locales) | ACCOUNT_ROLE_COPY | Used by `Register.jsx` (student/parent options) and `Profile.jsx:147` (role label display) — direct account-role copy, in scope for consolidation |
| `dashboard.roles.*`, `dashboard.items.*` (as referenced by `TeacherDashboard.jsx`/`ParentDashboard.jsx`/`Dashboard.jsx`) | **Does not exist** in `en.js`/`ar.js` `dashboard` object | **ORPHANED reference** (the code refers to a key that was never defined there) | Root cause of the §1 crash — the *correct* source (`experience.js`'s `getDashboardCopy`/`getExperienceText(lang).dashboard`) does have `roles`/`items` and is what `DashboardLayout.jsx`/`MobileBottomNav.jsx` correctly use instead |
| `experience.js` `DASHBOARD_COPY.*.roles` (`administrator`/`teacher`/`parent`/`student`/`plan`) | `experience.js:75` (+5 locale entries) | ACCOUNT_ROLE_COPY | Correctly wired via `roleLabel()` in `dashboardNav.js:69-77`, consumed by `DashboardLayout.jsx:271` |
| `nav__mobile-profile-role` (raw `{user.role}`) | `Header.jsx:195` | ORPHANED from translation entirely — an **untranslated raw value** shown directly, not a lookup key at all | Pre-existing i18n gap, consistent with `localization-audit.md`'s "admin panel has zero `useLang` usage" finding pattern, not previously itemized this specifically |
| `blogs.author_role` / `testimonials.author_role` content (DB rows, not i18n keys) | DB data, rendered via `Blog.jsx:126` | PUBLIC_EDUCATIONAL_CONTENT | Not a translation-file key at all — free-text DB content; explicitly not an account-role concept (§6) |
| `teacherDash.*`, `parentDash.*` (full locale dictionaries) | `en.js:1280,1313` (+5 locales each) | ACCOUNT_ROLE_COPY (dashboard-specific) | Attached to `TeacherDashboard.jsx`/`ParentDashboard.jsx` — sunk cost if those pages are deleted per §8, matching the "do not extend, delete alongside the page" pattern already established in `localization-audit.md`/Stage 2 Batch 1 |
| Public teacher/tutor content (`teachersPg.*`, `Teachers.jsx`/`TeacherProfile.jsx` copy) | `en.js` (not further line-inventoried — out of role scope) | PUBLIC_EDUCATIONAL_CONTENT | Explicitly the "public teacher directory" the target contract says not to confuse with the teacher account role (§5 rule 8) — confirmed distinct component tree (`Teachers.jsx`/`TeacherProfile.jsx`, public routes, no auth dependency found) |
| Enrollment form's parent/child/student data-entry labels | Not line-inventoried in this pass (Enroll.jsx not opened) | FORM_DATA_LABEL (expected) | **UNKNOWN** — flagged for Batch 2A/2B verification, not confirmed by direct evidence in this audit |

No translation key was deleted or modified in this audit (read-only, per the explicit constraint). The `dashboard.roles`/`dashboard.items` gap is reported as a finding, not corrected here.

---

## 16. Unified decision matrix

| File/symbol | Current purpose | Reachability | Dependencies | Decision | Target replacement | Deletion prerequisites | Required regression test | Risk | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| `artifacts/al-rahma-academy/src/pages/TeacherDashboard.jsx` | Teacher portal: roster, scheduling, records | Route-reachable, render-crashes | `teacherApi`, `courseApi`, `classApi`, `dashboardNav.js`, `App.jsx` route, `Header.jsx`/`MobileBottomNav.jsx`/`CommandPalette.jsx` nav entries, `StudentModal.jsx` | DELETE_PROPOSED | none (role removed) | §14 test list; confirm no other component imports it | new: "no `/teacher` route" guard (extend `removed-lms-routes.test.js`'s pattern) | Low (already non-functional) | §8 |
| `artifacts/al-rahma-academy/src/pages/ParentDashboard.jsx` | Parent portal: child linking, reports | Route-reachable, render-crashes | `parentApi`, `classApi`, nav entries (same set), `ChildModal.jsx` | DELETE_PROPOSED | none, unless parent-child linking is redesigned (§12 open item) | Same + resolve the parent-link open dependency first | Same pattern | Low functionally, MEDIUM on the open linking-feature dependency | §8, §12 |
| `artifacts/al-rahma-academy/src/components/features/teacher/StudentModal.jsx` | Teacher's per-student record editor | Only reachable from `TeacherDashboard.jsx` | `TeacherDashboard.jsx` | DELETE_PROPOSED (orphaned once TeacherDashboard is deleted) | none | Confirm zero other importers first | none needed beyond import-check | Low | `TeacherDashboard.jsx:21` |
| `artifacts/al-rahma-academy/src/components/features/parent/ChildModal.jsx` | Parent's per-child view | Only reachable from `ParentDashboard.jsx` | `ParentDashboard.jsx` | DELETE_PROPOSED (same pattern) | none | Same | none | Low | `ParentDashboard.jsx:17` |
| `App.jsx` routes `/teacher`, `/parent` | Route registration | Direct | — | DELETE_PROPOSED | none | — | extend guard test | Low | `App.jsx:179-180` |
| `ProtectedRoute.jsx`'s `role` prop | Generic role-name guard | Used only by the 2 routes above | `App.jsx` | DELETE_PROPOSED (the prop itself; `adminOnly` stays) | none | Confirm no other call site adds a new `role=` usage before removing the prop | new guard test asserting the prop is gone/no-op | Low | `ProtectedRoute.jsx:15,32` |
| `AuthContext.jsx`'s `isTeacher`, `isParent` | Derived booleans | Read by ~10 files (§6) | dashboardNav.js, Header.jsx, MobileBottomNav.jsx, CommandPalette.jsx, DashboardLayout.jsx, CalendarPage.jsx | MERGE_INTO_USER (remove; `isAdmin` survives) | none | Update all ~10 read sites in the same batch (Batch 2A/2B) | new `AuthContext.test.jsx` (§14, doesn't exist today) | MEDIUM (wide fan-out) | §6 |
| `Register.jsx`'s role `<select>` (lines 68-72) + `form.role` field | Public role selection | Direct, public | `authApi.registerUser` | REDESIGN | remove entirely; registration always creates `user` | none — purely additive removal | new "public signup always creates user" test (§14) | HIGH if skipped (this is the actual security-relevant gap) | §1, §9 finding 1 |
| `AdminUsersTab.jsx`'s role `<select>` (lines 75-80) incl. `'admin'` option | Admin role-change UI | Reachable behind hardened admin session | `adminApi.updateUserRole` | REDESIGN (narrow to `user`⇄`admin` only, drop `teacher`/`parent`/`student` options) | rebuild against `admin_set_role()` RPC once wired (Batch 2D/2E) | Batch 2D DB wiring | new admin-promotion test (§14) | MEDIUM | §9 finding 2 |
| `AdminStaffTab.jsx` | Create teacher/parent accounts | Reachable, already flagged CUT in `product-scope-audit.md` | `adminApi.adminCreateUser` | DELETE_PROPOSED (confirms, does not newly decide, the existing scope decision) | none | none beyond existing plan | none new | Low | `product-scope-audit.md` §1, this audit §6 |
| `dashboardNav.js`'s teacher/parent branches (`navFor`/`bottomNavFor`) | Nav item lists | Direct | `DashboardLayout.jsx`, `MobileBottomNav.jsx` | MERGE_INTO_USER (delete branches, keep function shape for `admin`/default) | none | Update after dashboards are deleted, not before (avoid dangling nav to a still-existing route mid-batch) | extend `removed-lms-routes.test.js`-style guard | Low | `dashboardNav.js:22-37,83-89` |
| `CommandPalette.jsx`'s 3 role-scoped `STATIC_ITEMS` entries | Command-palette shortcuts | Direct | `CommandPalette.jsx` | MERGE_INTO_USER (drop `teacherDashboard`/`parentDashboard`, keep `studentDashboard`→ rename, `adminDashboard`) | none | none | none new needed | Low | `CommandPalette.jsx:8-11` |
| `Header.jsx`'s 2 role-ternary blocks (mobile account link + icon) | Role-based dashboard link/icon | Direct | `Header.jsx:209,214,351,357` | MERGE_INTO_USER | 2-branch ternary (`isAdmin ? ... : default`) | none | none new | Low | `Header.jsx` |
| `t.dashboard.roles`/`t.dashboard.items` broken references (3 files) | Page-header copy | Direct, currently crashing | `Dashboard.jsx`, `TeacherDashboard.jsx`, `ParentDashboard.jsx` | **REDESIGN (fix independent of role work — retarget to `getExperienceText(lang).dashboard`)** | same object `DashboardLayout.jsx`/`MobileBottomNav.jsx` already use correctly | none | new test rendering `Dashboard.jsx` (doesn't exist today — a real gap) | **HIGH** (currently broken in production today) | §1 |
| `lib/db`'s `account_role` enum, `handle_new_user()`, `admin_set_role()` | 2-role DB contract | Not wired, otherwise correct | RLS policies, local tests | **KEEP** | itself — becomes the real source of truth once wired (Batch 2D) | Auth-architecture decision (server-mediated session vs. Supabase Auth JS — explicitly still open per the master plan) | existing `lib/db/test/` suite (already passing) | Low (already proven locally) | §11 |

**Exact proposed deletion manifest** (active tracked files only; excludes anything in `.migration-backup/`; deletion authorization is NOT granted by this document):

- `artifacts/al-rahma-academy/src/pages/TeacherDashboard.jsx`
- `artifacts/al-rahma-academy/src/pages/ParentDashboard.jsx`
- `artifacts/al-rahma-academy/src/components/features/teacher/StudentModal.jsx`
- `artifacts/al-rahma-academy/src/components/features/parent/ChildModal.jsx`
- `artifacts/al-rahma-academy/src/components/features/admin/AdminStaffTab.jsx` (already decided in `product-scope-audit.md`; listed here only for cross-reference completeness, not a new decision)

5 unique active tracked paths. (Their associated route entries, nav entries, i18n dictionaries, and tests are edits to surviving files, not separate deletions, and are listed as such in the rows above — not double-counted here.)

---

## 17. REDESIGN / DEFER / UNKNOWN list

**REDESIGN:**
- `Register.jsx`'s role selector and `form.role` submission (§9, §16).
- `AdminUsersTab.jsx`'s role `<select>` (narrow to user/admin, §16).
- `/admin/login`'s `adminOnly` pre-guard (§13 finding 4).
- The `t.dashboard.roles`/`t.dashboard.items` broken references in `Dashboard.jsx`/`TeacherDashboard.jsx`/`ParentDashboard.jsx` (§1, §16) — flagged as HIGH priority precisely because Batch 2B will touch these same three files anyway.

**DEFER (explicit, not this audit's decision to resolve):**
- Parent-child link code feature (`getMyLinkCode`, `parentApi.js`) — survives only if a product decision keeps some form of child-linking under the `user` model (§12).
- Notification preferences UI — not located; needs Batch 2D scoping, not deletion (§12).
- Daily reminder preferences — not located anywhere in tracked code; needs a product decision on whether it ever existed as described or needs to be newly built (§12).
- Community/Messages/Calendar/AI Tutor — already DEFERRED or CUT by `product-scope-audit.md`; this audit found nothing to change that.
- Whether `admin_set_role()`/DB wiring happens before or alongside Batch 2B — an implementation-sequencing choice for Batch 2A/2D, not decided here.

**UNKNOWN:**
- Actual live behavior of the external upstream (`UPSTREAM_API_ORIGIN`) for every one of the 116 proxied endpoints — cannot be verified from this repository (§9).
- Whether the real, deployed `AdminUser` system currently implements sub-role/permission checks (the `'editor'` comment in `AdminDashboard.jsx:189` describes an assumed behavior, not confirmed code) (§6, §13).
- `lib/api-spec`/`lib/api-client-react` role-related content, if any — not inspected in depth in this pass (§3).
- Full enrollment-form field-label classification (§15) — not line-inventoried.
- Any RBAC/testimonials-consumer wiring for `testimonials.author_role` (§6, §11).

---

## 18. Ordered implementation batches (proposed, not executed)

### Batch 2A — Install the user/admin contract and Auth/Routing tests
**Objective:** make `AuthContext`/`ProtectedRoute`/registration match the target contract, and fix the independent `t.dashboard` crash, before touching any dashboard page.
**Exact files/symbols:** `AuthContext.jsx` (remove `isTeacher`/`isParent`), `ProtectedRoute.jsx` (remove `role` prop), `Register.jsx` (remove role selector/field), `Login.jsx` (`goToRole` simplified to admin/default), `Dashboard.jsx`/`TeacherDashboard.jsx`/`ParentDashboard.jsx` (retarget `t.dashboard.roles/items` → `getExperienceText(lang).dashboard`, as an independent fix — TeacherDashboard/ParentDashboard fixed here only so Batch 2B's deletion diff isn't polluted by an unrelated bugfix, or the fix can be skipped for the 2 files being deleted in 2B and applied to `Dashboard.jsx` alone — sequencing choice for the batch's own author, not fixed here).
**Preconditions:** this audit accepted; no Remote/Supabase change.
**Changes:** as above; new `AuthContext.test.jsx`, extended `ProtectedRoute` coverage.
**Tests:** the full §14 "required before implementation" list, scoped to what Batch 2A actually changes (public-signup-creates-user, spoofed-role-cannot-elevate, generic-landing-route, missing-role-fails-safe).
**Acceptance criteria:** no `role="teacher"`/`role="parent"` literal remains in `src/`; `Dashboard.jsx` renders without throwing (proven by a real test, not just inspection); new tests pass.
**Rollback point:** a new checkpoint tag at the end of this batch.
**Deletion authorization required:** no (no file deletions in this batch).
**Dependencies:** none beyond this audit.

### Batch 2B — Remove/merge Teacher/Parent/Student dashboards, routes, and navigation
**Objective:** execute the exact deletion manifest in §16.
**Exact files/symbols:** the 4 (or 5, cross-referencing `AdminStaffTab.jsx`) files in §16's manifest; `App.jsx` routes; `dashboardNav.js` branches; `CommandPalette.jsx` 3 entries; `Header.jsx` 2 ternary blocks; `MobileBottomNav.jsx` (uses `bottomNavFor`, no direct edit needed beyond what `dashboardNav.js` already changes); i18n `teacherDash`/`parentDash` dictionaries (delete alongside, matching the established Stage 2 Batch 1 pattern) and `authPg.profile.roleTeacher`/`roleParent`/`roleStudent`/`accountType` (delete once `Register.jsx`'s selector is gone — coordinate with Batch 2A if not already done there).
**Preconditions:** Batch 2A complete and merged onto this batch's base; **explicit deletion authorization from the user for this specific file list**, per this repository's established pattern.
**Changes:** deletions + the associated route/nav/i18n edits.
**Tests:** extend `removed-lms-routes.test.js`'s pattern for `/teacher`/`/parent`; new/updated `AdminDashboard.test.jsx` if `AdminStaffTab` is deleted here rather than separately.
**Acceptance criteria:** build + full suite pass with zero references to deleted modules; no nav path to a deleted route (matches the Stage 2 Batch 1 verification pattern exactly).
**Rollback point:** Batch 2A's checkpoint tag.
**Deletion authorization required:** **YES**, explicitly, for this file list.
**Dependencies:** Batch 2A (shared files: `AuthContext.jsx`, `dashboardNav.js`).

### Batch 2C — Clean up orphaned APIs/types/components/translations
**Objective:** remove what Batch 2B's deletions leave orphaned.
**Exact files/symbols:** `teacherApi.js`, `parentApi.js` (unless the parent-link feature is redesigned to survive — resolve the §12/§17 open dependency first, in this batch, not silently), `AdminStaffTab.jsx` if not already handled in 2B, any now-zero-usage translation keys proven by search (not by name).
**Preconditions:** Batch 2B complete; the parent-link open question resolved one way or the other.
**Changes:** deletions, each individually search-proven orphaned (matching this repo's established "prove zero usage" discipline from Stage 2 Batch 1).
**Tests:** import/reference search proving zero remaining usage before each deletion; full suite re-run.
**Acceptance criteria:** matches Stage 2 Batch 1's acceptance pattern.
**Rollback point:** Batch 2B's checkpoint.
**Deletion authorization required:** YES, per file, same discipline as Batch 2B.
**Dependencies:** Batch 2B.

### Batch 2D — Wire a unified `user` account interface to real endpoints
**Objective:** replace the proxied, unverified `/api/*` calls for the §12 KEEP feature set with real `api-server` + `lib/db` implementations, resolving the still-open auth-architecture decision (server-mediated session vs. Supabase Auth JS — flagged as open by the master plan, reconfirmed still open by this audit).
**Exact files/symbols:** `artifacts/api-server/src/routes/*` (new), `lib/db` (already correct, wire as a real dependency), `src/api/http.js`/`adminHttp.js` (retarget base URL/session shape once the architecture decision is made), all §12 KEEP feature API clients.
**Preconditions:** Batches 2A-2C complete; the auth-architecture decision made (a product/engineering call, not this audit's to make).
**Changes:** new backend routes against `lib/db`; frontend API client updates.
**Tests:** new `api-server` route tests (none exist today, confirmed by this audit — §14's DB-side note); a real login→session→protected-route round trip against the local stack.
**Acceptance criteria:** zero legacy-backend/proxy calls remain for the KEEP feature set; `lib/db` suite still passes.
**Rollback point:** Batch 2C's checkpoint (app code) + the already-proven Option A DB rollback tooling (data/schema).
**Deletion authorization required:** no new deletions expected, but confirm before executing (proxy code may become dead and a candidate for a later batch).
**Dependencies:** Batches 2A-2C; the auth-architecture decision.

### Batch 2E — Admin hardening: connect verification to server/RLS/AAL2
**Objective:** replace the legacy `role==='admin'` field's role in the admin-gating story with the DB's own `is_admin_aal2()`/`admin_set_role()` as the real source of truth, once `api-server` actually has a session to check.
**Exact files/symbols:** `ProtectedRoute.jsx`'s `adminOnly` check, `AdminSessionGate.jsx`, `AdminUsersTab.jsx`'s role select (narrow further or retire), server-side session verification.
**Preconditions:** Batch 2D complete (a real backend session must exist to check against).
**Changes:** replace the legacy-field check with a real, server-verified admin session; keep the AAL2 MFA requirement.
**Tests:** admin route restricted to admin (server-verified, not just client-cached `role`); a non-admin cannot reach `/admin` even with a crafted cached profile.
**Acceptance criteria:** admin gating no longer trusts any client-controllable field.
**Rollback point:** Batch 2D's checkpoint.
**Deletion authorization required:** possibly, if the legacy `role==='admin'` check is fully retired — confirm at the time.
**Dependencies:** Batch 2D.

**Sequencing note:** this order matches the task's suggested Batch 2A-2E structure; this audit found no evidence requiring a different order, with one addition — Batch 2A explicitly absorbs the independent `t.dashboard` crash fix (or at minimum `Dashboard.jsx`'s half of it) ahead of Batch 2B, since leaving a known-broken page in place while deleting its siblings makes Batch 2B's own regression testing unreliable.

---

## 19. Risks/blockers

- **Blocker for Batch 2D specifically:** the auth-architecture decision (server-mediated session vs. Supabase Auth JS directly in the browser) is still open, exactly as the master plan (`shiny-discovering-rose.md`) already flagged — this audit did not resolve it and was not asked to.
- **Blocker for Batch 2C:** the parent-child link feature's fate (§12, §17) must be decided before `parentApi.js`/`getMyLinkCode` can be safely classified as orphaned or preserved.
- **Not a blocker, but should precede Batch 2B in practice:** the `t.dashboard.roles`/`items` crash (§1) — Batch 2B's own regression testing ("full suite pass," "no reference to deleted modules") is more reliable if `Dashboard.jsx` is provably rendering correctly first.
- **External dependency risk:** every one of the 116 proxied endpoints' real behavior is unverifiable from this repository. Any Batch 2A/2B test that asserts something about *server* behavior (e.g., "spoofed role cannot elevate") can only be proven once Batch 2D gives the app a real, local, inspectable backend — until then, such tests can only cover the frontend's own behavior (what it sends, how it routes on the response), not the server's enforcement.
- **No blocker found for Batch 2A** beyond accepting this audit.

---

## 20. Explicit confirmation that no implementation occurred

No Product code, route, component, test, translation, CSS, schema, or migration file was created, modified, or deleted in this task. The only writes performed were: creating branch `audit/legacy-roles-dashboard-reachability`; creating this document; the commit described in §21 below. One read-only diagnostic (`node -e` importing the tracked `en.js`/`ar.js` modules to prove the `t.dashboard.roles`/`items` crash) was run against already-tracked source files with no side effects and no files written by it.

---

## 21. Counts

Methodology is stated for each; only unique runtime symbols/values are counted where the task specifies it, not raw text occurrences.

| Count | Value | Method |
|---|---|---|
| Active tracked files opened/read directly with cited evidence in this audit | ~55 | Every file cited by exact path in §3-§16 above (App.jsx, dashboardNav.js, TeacherDashboard.jsx, ParentDashboard.jsx, Dashboard.jsx, AdminDashboard.jsx, AuthContext.jsx, AdminAuthContext.jsx, ProtectedRoute.jsx, AdminSessionGate.jsx, Header.jsx, MobileBottomNav.jsx, CommandPalette.jsx, Login.jsx, Register.jsx, Profile.jsx, NotificationPanel.jsx, 26 files under `src/api/`, AdminUsersTab.jsx, AdminStaffTab.jsx, StudentModal.jsx (grep-cited), ChildModal.jsx (grep-cited), CertificateCard.jsx, AdminProgressModal.jsx, en.js, ar.js, experience.js, enums.ts, profiles.ts, 3 Drizzle migration files, vite.config.ts, main.jsx, 3 api-server files, pnpm-workspace.yaml, root package.json, one `.migration-backup` historical file) |
| Files matched by `git grep` and classified from grep context only (not individually opened) | ~65 additional | The broader role-symbol search result set (§ role-symbol search, first broad list of ~100 files narrowed to the ~84-line targeted grep) minus the ~55 opened above |
| Role symbols — frontend/API-server layer (unique runtime symbols/values, not text occurrences) | 8 | `User.role` (field) + 4 values in active use (`student`,`teacher`,`parent`,`admin`) + `isAdmin`/`isTeacher`/`isParent` (3 derived booleans) — counted as 1 field + 4 values + 3 booleans = 8 |
| Role symbols — separate hardened admin model | 1 | `AdminUser`/`adminUser` (one distinct model, not a value of the field above) |
| Role symbols — DB layer | 3 | `account_role` enum type + 2 values (`'user'`,`'admin'`) |
| Routes — unique registered patterns | 67 | `grep -c '<Route path=' App.jsx` |
| Role-guarded routes | 4 | `/teacher`, `/parent` (`role=` prop) + `/admin`, `/admin/login` (`adminOnly` prop) — `grep -n 'role="\|adminOnly' App.jsx` |
| Endpoints — unique METHOD + normalized path | 116 | `git grep -hoE "(http|adminHttp)\.(get|post|put|patch|delete)\(..." -- src/api/*.js`, path params normalized to `:id`, deduplicated |
| Locally-implemented endpoints (of the 116) | 1 | `GET /healthz` in `api-server/src/routes/health.ts` — every other call proxies |
| Test files — total in suite | 33 | Stage 2 Batch 1's confirmed post-change count |
| Test files referencing role-related terms | 14 | `git grep -lE "teacher\|parent\|student\|isAdmin\|role" -- src/test/*.test.{js,jsx}` |
| Test files with zero role-related content covering Auth/ProtectedRoute/dashboards directly | 0 | Confirmed absence: no `AuthContext.test.jsx`, `ProtectedRoute.*.test`, `TeacherDashboard.test`, `ParentDashboard.test`, or `Dashboard.test` file exists in the tracked test directory listing |
| Translation keys directly identified as role-relevant | 6 distinct logical keys | `accountType`, `roleStudent`, `roleParent`, `roleTeacher`, `roleAdmin` (in `authPg.profile`) + the `dashboard.roles`/`dashboard.items` broken-reference pair (counted as one class of finding, not per-sub-key) |
| Localized entries for the 5 `authPg.profile` role keys | 30 | 5 keys × 6 locales (`en`,`ar`,`it`,`es`,`de`,`fr`), each confirmed present at the same relative line offset pattern as `en.js` |
| Proposed deletions — unique active tracked paths | 5 | §16's exact manifest (`TeacherDashboard.jsx`, `ParentDashboard.jsx`, `StudentModal.jsx`, `ChildModal.jsx`, `AdminStaffTab.jsx` — the last already decided in `product-scope-audit.md`, listed for cross-reference) |
| `.migration-backup/` files consulted (excluded from all counts above, HISTORICAL_ONLY) | 2 | `.migration-backup/backend/controllers/authController.js` (registration role clamp), `.migration-backup/backend/controllers/aiTutorController.js` (chat-role shape confirmation) |

---

## 22. Status note — Stage 2A execution (added after this audit, historical results above unchanged)

Stage 2A ("User/Admin Auth Contract and Safe Routing Remediation") executed the application-layer remediation this audit's §1 identified as the entire gap, on branch `feat/user-admin-auth-contract` (from checkpoint `checkpoint/stage-02-role-audit-complete` = this audit's closing SHA `49fe8b567e63339491860c443e7f382c203d7a1a`). It did not redo this audit or change any of the findings above — it is recorded here only as a pointer.

Summary of what changed (full detail in `docs/user-admin-auth-contract.md`): a new `src/utils/accountRoles.js` centralizes role normalization; `AuthContext.jsx` no longer derives `isAdmin`/`isTeacher`/`isParent` from the regular account's `role` field; `AdminAuthContext.jsx` is now the single source of a real `isAdmin`, proven only by the AdminUser + MFA session; `ProtectedRoute.jsx`'s `adminOnly` gate was repointed at that real session and its `role` prop was removed; `/admin/login` is reachable pre-authentication (the circular-guard bug this audit flagged is fixed); `/teacher` and `/parent` now redirect to the generic `/dashboard` instead of selecting `TeacherDashboard`/`ParentDashboard` by role; `Register.jsx`'s role selector was removed and its payload no longer carries a role field; the `t.dashboard.roles`/`t.dashboard.items` crash this audit proved (§ crash proof, `Dashboard.jsx`/`TeacherDashboard.jsx`/`ParentDashboard.jsx`) was fixed at the source in all three files, for all 6 locales; navigation (`dashboardNav.js`, `Header.jsx`, `CommandPalette.jsx`, `MobileBottomNav.jsx`) lost its teacher/parent branches; `AdminUsersTab.jsx`'s role-change `<select>` was made read-only pending a proven backend RPC.

Consistent with this audit's own §16 (deletion NOT authorized by the audit document) and Stage 2A's explicit brief: `TeacherDashboard.jsx`, `ParentDashboard.jsx`, `StudentModal.jsx`, `ChildModal.jsx`, and `AdminStaffTab.jsx` were **not deleted** — the first two are now unreachable via routing (not via file removal); the other three were not touched at all. This audit's §17 (proposed future batches 2A-2E) remains the forward plan; only 2A has executed. The External Upstream's actual server-side behavior remains exactly as unverifiable as this audit found it (§ auth flow, § API endpoint ownership) — Stage 2A changed only frontend routing/state, never Remote.

---

## 23. Status note — Stage 2B execution (added after this audit and Stage 2A, historical results above unchanged)

Stage 2B ("Close Stage 2A Evidence Gaps and Remove Legacy Role Dashboards") executed on branch `feat/prune-legacy-role-dashboards` (from checkpoint `checkpoint/stage-02a-user-admin-contract` = Stage 2A's closing SHA `5fac82d7715f8c321a034a1f38fa102d89369a1b`). Full detail: `docs/legacy-role-dashboard-pruning.md`.

Of this audit's §16 5-file deletion manifest, 3 were deleted: `TeacherDashboard.jsx`, `StudentModal.jsx`, `AdminStaffTab.jsx` (each proven unreachable/orphaned with no companion-feature entanglement). **`ParentDashboard.jsx` and `ChildModal.jsx` were left BLOCKED, not deleted** — this audit's own §12/§17 explicitly flagged the "Parent-child link code" feature as UNKNOWN/DEFER, a product decision outside this audit's authority; Stage 2B confirmed by direct inspection that `Profile.jsx` (a KEEP page) still actively generates and displays the child-side half of that link code (`getMyLinkCode()`), so deleting `ParentDashboard.jsx` (the only parent-side consumer of that code) would have silently resolved that still-open product question rather than executing an already-decided deletion. This audit's own classification (DELETE_PROPOSED, §16) is not overridden by this note — it is recorded here as the reason execution stopped short of it, pending that product decision.

## 24. Status note — Stage 2C execution (added after Stage 2B, historical results above unchanged)

The product decision this audit's §12/§17 deferred was made explicitly in Stage 2C ("Remove Parent/Child Legacy Accounts and Clean Role Orphans"): there are no teacher/parent/student account types, only `user`/`admin`; parent-child linking is out of product scope. On that basis, Stage 2C deleted `ParentDashboard.jsx` and `ChildModal.jsx` — the two files this audit's own manifest (§16) always classified `DELETE_PROPOSED` and that §23 above records as execution having stopped short of. It also deleted `teacherApi.js`/`parentApi.js`, the `getMyLinkCode()` UI this note's §23 references as still-live, and the `adminCreateUser`/`assignTeacher` admin-side orphans. Full detail, dependency evidence, and everything else Stage 2C touched: `docs/legacy-role-orphan-cleanup.md`. This audit's historical findings and DELETE_PROPOSED classification stand as an accurate record of the analysis at the time they were written; they are not rewritten here.
