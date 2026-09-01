# Legacy Role Orphan Cleanup (Stage 2C)

**Stage 2C — Remove Parent/Child Legacy Accounts and Clean Role Orphans.** Local implementation task; no Push/Merge/PR/Deploy; no Supabase/SQL/migrations/RLS/Remote touched; no `.env` read; no `backend/` entered; no `.migration-backup` modified; no `git add -A`; no package install.

Starting SHA: `422e98b55848bcfc1ce837119a246359d9dabe45` (= `checkpoint/stage-02b-safe-pruning`, Stage 2B's closing commit)
Branch: `feat/remove-parent-child-and-role-orphans`
Date: 2026-09-01

## Product decision (given, not derived here)

There are no `teacher`/`parent`/`student` account types. Every public registration produces a plain `user` account. `admin` is the sole distinguished role, proven exclusively by the separate `AdminAuthContext` + MFA session (see `docs/user-admin-auth-contract.md`) — never by the regular account's own `role` field. Parent-child account linking is out of product scope. `student`/`parent`/`child` *data fields* inside Trial/Enrollment forms are general-purpose form data, not account roles, and are preserved. The public teacher directory and `preferred_teacher_key`/teacher-selection data in Enrollment are preserved.

This decision is what unblocked `ParentDashboard.jsx`/`ChildModal.jsx`, which Stage 2B had left explicitly BLOCKED pending exactly this product call (see `docs/legacy-role-dashboard-pruning.md`, Part B).

---

## Part A — dependency map (built before any deletion)

### 1. ParentDashboard.jsx / ChildModal.jsx

| | |
|---|---|
| `pages/ParentDashboard.jsx` | Not imported anywhere (App.jsx's lazy-import was already removed in Stage 2A). `/parent` has redirected to `/dashboard` since Stage 2A/2B — the file was unreachable via routing before this stage touched it. |
| `components/features/parent/ChildModal.jsx` | Imported only by `ParentDashboard.jsx` (`import ChildModal from '../components/features/parent/ChildModal'`), rendered only there. No other opener anywhere in `src/`. |
| API surface | `parentApi.js`: `linkChild`, `getMyChildren`, `getChildDetail`, `unlinkChild` — consumed only by these two files (confirmed via `grep -rln "parentApi"` across `src/`: `api/index.js` barrel, `ChildModal.jsx`, `ParentDashboard.jsx` — no other consumer). |
| Translations | `t.parentDash` (i18n key `parentDash`) — read only by `ParentDashboard.jsx` (`const L = t.parentDash`) and passed as `L` prop into `ChildModal.jsx`. Zero other consumers. |
| Trial/Enrollment overlap | **None.** Neither file is imported by, nor shares code with, any Trial/Enrollment component. |

**Decision: DELETE both.** The only reason they survived Stage 2B — the undecided product question about `getMyLinkCode()`'s fate — is resolved by this stage's given decision (see below).

### 2. Link-code system inside Profile.jsx

Traced end to end before touching anything:

- UI: a "Parent link code" card (`pg.parentLink` heading, `pg.parentLinkDesc` copy, a reveal button or a revealed `<code>` block with a copy button), gated by `isStudent = !user?.role || user.role === 'student'`.
- API client: `getMyLinkCode()` in `api/authApi.js` → `GET /auth/link-code`.
- Local state: `linkCode`, `codeLoading`; handler `revealCode()`.
- Copy: `pg.parentLink`, `pg.parentLinkDesc`, `pg.showLinkCode`, `pg.copy` (all under `authPg.profile` in each of the 6 locale files).
- No QR/share behavior existed (text + copy-to-clipboard only).
- No parent-side matching endpoint lives in Profile.jsx itself — the parent-side half was `ParentDashboard.jsx`'s `linkChild()` call, deleted above.
- Tests: none existed for Profile.jsx before this stage (zero prior coverage).

**Removed from Profile.jsx:** the entire card, `revealCode`, `linkCode`/`codeLoading` state, the `getMyLinkCode` import, `isStudent` (its only consumer). The `getMyLinkCode` export itself was deleted from `api/authApi.js` (zero consumers left). `roleLabel`'s 4-way ternary (admin/teacher/parent/student) was simplified to 2-way (admin/user) in the same pass — it sat immediately adjacent to the code being edited and depended on the same now-nonexistent teacher/parent/student distinction (see Part A §9 below for why this was in-scope).

**Preserved in Profile.jsx (verified untouched):** personal-info form, password-change form, subscription card, courses list, certificates list, quick links. `getMe`/`getCourses`/`getMyCertificates` queries unchanged.

### 3. Parent-child API cleanup

| Symbol | File | Consumers before | Consumers after | Shared use? | Decision |
|---|---|---|---|---|---|
| `linkChild`, `getMyChildren`, `getChildDetail`, `unlinkChild` | `api/parentApi.js` | `ParentDashboard.jsx`, `ChildModal.jsx` | 0 | No | **DELETE file** (all 4 exports, whole file — exclusively parent-account API, zero non-deleted consumers) |
| `getMyLinkCode` | `api/authApi.js` | `Profile.jsx` | 0 | No | **DELETE export** (file kept — `authApi.js` also exports `registerUser`/`loginUser`/`logoutUser`/`getMe`/`updateMe`/`forgotPassword`/`resetPassword`/`googleLogin`, all live) |

The `GET /parent/link`, `GET /parent/children`, `GET /parent/children/:id`, `DELETE /parent/children/:id`, and `GET /auth/link-code` server-side endpoints were **not** touched, contacted, or claimed removed — this task has no Remote/backend access. Their frontend consumers are simply gone now.

### 4. teacherApi.js

Read in full. 4 exports, all pointed at `/teacher/*`: `getMyStudents`, `getStudentDetail`, `addStudentRecord`, `deleteStudentRecord`. These are the **authenticated teacher-account** self-service endpoints (a teacher viewing/editing their own assigned students' records) — categorically different from:
- the **public teacher directory** (`Teachers.jsx`/`TeacherProfile.jsx`), which reads a static, hardcoded `TEACHERS` array from `data/marketing/teachers.js` — no API call at all, confirmed by reading `Teachers.jsx`'s imports;
- **Enrollment's preferred-teacher data** — confirmed via repo-wide grep that no `preferred_teacher_key`/`preferredTeacher`/`teacherSnapshot` symbol exists anywhere in `src/` today (the concept lives only in `lib/db`'s schema, unwired to the frontend; nothing here could have touched it);
- **Admin's teacher-assignment control** — a separate `adminApi.js` symbol, handled in §5 below.

Grep confirmed exactly one consumer of `teacherApi.js`: the `api/index.js` barrel (`export * from './teacherApi'`), which itself has zero importers anywhere in `src/`. Both `StudentModal.jsx` and `TeacherDashboard.jsx` — its only real former consumers — were already deleted in Stage 2B.

**Decision: DELETE the whole file.** It is exclusively legacy teacher-account API; nothing else uses it; `Teachers.jsx`/`TeacherProfile.jsx`/Enrollment's teacher-selection UI are unaffected (they never imported it).

### 5. AdminUsersTab teacher assignment

The teacher-assignment `<select>` (`handleAssignTeacher` → `assignTeacher(studentId, teacherId)` → `PATCH /v1/admin/users/:id/teacher`) attaches a **legacy teacher account** (a `User` row with `role: 'teacher'`, listed via `listTeachers()` → `GET /v1/admin/users/teachers`) to a student row, so that teacher can access that student's records via `teacherApi.js` — i.e. it is the admin-side half of exactly the deleted §4 relationship, not a `preferred_teacher_key`-style Enrollment field. There is no reachable public/Enrollment consumer of this relationship left after §4's deletion.

**Decision: DELETE the UI/action/client call.** Removed from `AdminUsersTab.jsx`: the `<select>` cell, `handleAssignTeacher`, the `assignTeacher` import, and the `teachers` prop the component used to take (its sole use). Removed the now-empty `<th>Teacher</th>` header cell and corrected `colSpan` from 10 to 9. Removed `export const assignTeacher` from `api/adminApi.js` (zero consumers left).

**Explicitly NOT touched, and why:** `AdminDashboard.jsx`'s "Teachers list" overview card and its `teachers.length`/`students.length` KPI sublines still call `listTeachers()`/read `users.filter(u => u.role === 'student')` directly — these are **separate, multi-consumer, read-only admin displays** that Stage 2B already investigated and explicitly chose to keep ("a still-live, unrelated admin feature"). Removing the assignment *action* does not orphan `listTeachers()` — the overview card is still a live consumer of it. Deleting a whole additional admin display card was not named anywhere in this stage's manifest, and the task's own constraint against widening deletion beyond named, zero-consumer, exclusively-orphaned code applies here: `listTeachers()` is not zero-consumer. Left as-is; only the prop pass-through (`teachers={teachers}` into `AdminUsersTab`) was removed since that specific edge became orphaned. `AdminClassesTab.jsx`'s own separate `u.role === 'student'` filter (an unrelated tab, not named in this task's manifest) was likewise left untouched.

### 6. adminCreateUser

Grep-confirmed zero consumers: its only importer, `AdminStaffTab.jsx`, was deleted in Stage 2B, and nothing else ever called it.

**Decision: DELETE** `export const adminCreateUser` from `api/adminApi.js` (function + its usage; `adminApi.js` itself kept — `getUsers`/`updateUserRole`/`setFamilyName`/`listTeachers`/`updateUserSubscription` remain live). No new admin-user-creation implementation was added in this task (none was requested, and the task explicitly forbids inventing new implementation). The static guard in `legacyRoleOrphanCleanup.test.js` locks in that this symbol cannot silently return.

`updateUserRole` was already a documented Stage 2A orphan (see `AdminUsersTab.jsx`'s own header comment) before this task started — it is **not** in this stage's deletion manifest and was left untouched, consistent with "don't widen deletion beyond the named symbols."

---

## Part B — execution

### 7. Files deleted

| Path | Reason |
|---|---|
| `artifacts/al-rahma-academy/src/pages/ParentDashboard.jsx` | Unreachable via routing; product decision resolved the parent-child-linking question this stage explicitly settles |
| `artifacts/al-rahma-academy/src/components/features/parent/ChildModal.jsx` | Only reachable from the file above |
| `artifacts/al-rahma-academy/src/api/parentApi.js` | Zero consumers after the above two deletions; exclusively legacy parent-account API |
| `artifacts/al-rahma-academy/src/api/teacherApi.js` | Zero consumers; exclusively legacy teacher-account API (see §4) |

Each of these 4 names also exists a second time, untouched, at `.migration-backup/frontend/src/...` — confirmed via `find .migration-backup -name <file>` after deletion; never opened, read, or modified.

No file outside this 4-file set (plus the two already-deleted-in-Stage-2B files that remain deleted) was deleted in this task. `Profile.jsx`, `Teachers.jsx`, `TeacherProfile.jsx`, `AdminDashboard.jsx`, `AdminUsersTab.jsx`, `adminApi.js`, `authApi.js`, `api/index.js`, `App.jsx`, `Header.jsx`, `utils/nameInitials.js` were **edited**, not deleted.

### 8. Legacy redirects — reviewed, unchanged in behavior

`/teacher` and `/parent` are still registered as unconditional `<Route path="/teacher" element={<Navigate to="/dashboard" replace />} />` / same for `/parent` — no routing behavior changed in this stage (they already redirected to `/dashboard` since Stage 2A). No `/student` route is registered anywhere (`grep -n 'path="/student"'` on `App.jsx`: no match) — the "if a `/student` legacy route exists" clause is **not applicable**.

Verified behaviorally in `appRouting.behavioral.stage2c.test.jsx` (new, this stage): an **unauthenticated** visitor to `/teacher` or `/parent` is not left stuck on `/dashboard` — the chain continues through `/dashboard`'s own `ProtectedRoute` and lands on `/login`, with no redirect loop (this closes a real gap: Stage 2B's own behavioral test only waited for the intermediate `/dashboard` hop, not the final one). `replace` semantics were already in place (no new history entry). Locale/basename handling is unchanged — these routes don't touch `localePath.js`.

These two routes remain **temporary compatibility redirects, not role dashboards**, and are documented (in `App.jsx`'s own comment, updated this stage) as removable in a future release cleanup once nothing external still links to them — that removal is explicitly **not** done here.

### 9. Navigation and role-remnant sweep

Searched active `src/` (excluding `test/` and `.migration-backup/`) for: `isTeacher`, `isParent`, `isStudent`, role branches, teacher dashboard, parent dashboard, child account, parent-child link, admin create user, teacher assignment.

| Finding | Classification | Action |
|---|---|---|
| `Header.jsx`'s `{user.role}` raw interpolation | **ACTIVE_LEGACY_ROLE** | Fixed — see §10 |
| `Profile.jsx`'s `roleLabel` 4-way ternary (admin/teacher/parent/student) | **ACTIVE_LEGACY_ROLE** | Simplified to admin/user (see Part A §2) — in-scope because it sat directly in the code already being edited for the link-code removal, and depended on the same nonexistent distinction |
| `Profile.jsx`'s `isStudent` | **ACTIVE_LEGACY_ROLE** | Removed with its sole consumer (the link-code card) |
| `AdminUsersTab.jsx`'s teacher-assignment `<select>`/`assignTeacher` | **ACTIVE_LEGACY_ROLE** | Removed (Part A §5) |
| `AdminUsersTab.jsx`'s `u.role === 'student'` gate on the **family-name** column | **UNKNOWN / left alone** | Independent of teacher-assignment and the parent-child feature; not named in this task's manifest; touching it risked an undiscussed product call. Logged here, not resolved. |
| `AdminDashboard.jsx`'s `students = users.filter(u => u.role === 'student')` (KPI) and its "Teachers list" card | **ADMIN_CONTENT — reviewed, kept** | Multi-consumer, pre-existing, explicitly kept by Stage 2B; not named in this stage's manifest (see Part A §5) |
| `AdminClassesTab.jsx`'s own `u.role === 'student'` filter | **UNKNOWN / out of scope** | A different tab entirely, never named in this task; not touched |
| `dashboardNav.js`'s own comment ("no isTeacher/isParent any more") | **HISTORICAL_DOC** | Already correct since Stage 2A; left alone |
| `CalendarPage.jsx`'s comment referencing a removed `useAuth().isTeacher` | **HISTORICAL_DOC** | Pre-existing Stage 2A note; left alone |
| `App.jsx`'s comments naming ParentDashboard/TeacherDashboard | **HISTORICAL_DOC** | Updated to reflect this stage's outcome (not a behavior change) |
| `test/*` guard files naming these symbols | **TEST_GUARD** | Updated where they asserted the old (now-wrong) state; see §15 |
| `Register.jsx`/`Register.test.jsx` (no role selector) | **COMPATIBILITY_REDIRECT-adjacent / already correct** | Verified still correct (Stage 2A's existing guard); not modified |

No `isTeacher`/`isParent`/`isStudent` boolean symbol exists anywhere in active `src/` after this stage (confirmed by grep — the only remaining `u.role === 'student'` usages are the two explicitly logged UNKNOWN/kept items above, both raw field comparisons, not named boolean helpers).

### 10. Header raw role — fixed

`Header.jsx`'s mobile profile strip rendered `{user.role}` verbatim — for any account whose raw legacy `role` field still literally said `"teacher"`/`"parent"`/`"student"` (this field is never normalized before being cached in `AuthContext`'s `user` state — see `src/utils/accountRoles.js`'s own header comment), the header would show that raw, untranslated, legacy string.

**Fix:** replaced `{user.role}` with `{copy.account}` — an existing, already-6-language-translated generic label (`getExperienceText(lang).header.account`: "Account" / "الحساب" / "Cuenta" / "Konto" / "Compte" / "Account" across en/ar/es/de/fr/it), already imported into `Header.jsx` as `copy` and already used elsewhere on the same page. No new translation key was needed. The Admin header elements on this same page (dashboard-link icon, `isAdmin`-conditional routing) already come from the separate `AdminAuthContext` via `useAdminAuth()` and were untouched.

---

## Part C — tests

### Behavioral tests (new)

| File | Covers |
|---|---|
| `test/Profile.test.jsx` (new, 5 tests) | Profile renders and shows its generic sections (personal info, password, subscription) with no link-code section, no `<code>` element, no "link code" text anywhere in the DOM; `authApi` no longer even has a `getMyLinkCode` export to call; account-type label reads a generic translated "User" for a regular account and "Administrator" for an admin one, never "Teacher"/"Parent"/"Student" |
| `test/appRouting.behavioral.stage2c.test.jsx` (new, 4 tests) | Renders the real `App`: an unauthenticated visitor to `/teacher`/`/parent` ends at `/login` (not stuck at `/dashboard`, no loop); the public teacher directory (`/academy/teachers`) and an individual teacher profile (`/academy/teachers/1`) render and stay reachable with no auth |

### Static guards (new)

`test/legacyRoleOrphanCleanup.test.js` (new, 13 tests, `it.each` over all 6 locales for 3 of them): asserts `ParentDashboard.jsx`/`ChildModal.jsx`/`teacherApi.js`/`parentApi.js` don't exist; nothing imports the deleted pages or barrel exports; `getMyLinkCode`/`adminCreateUser`/`assignTeacher` are gone from their API files and from `Profile.jsx`/`AdminUsersTab.jsx`; `Header.jsx` has no `{user.role}` interpolation; `teacherDash`/`parentDash`/`roleTeacher`/`roleParent`/`parentLink`/`parentLinkDesc`/`showLinkCode` keys are gone from all 6 locale files while `roleUser` exists in all 6; no `/student` route is registered.

### Updated (existing files, to match the deletions)

- `test/legacyRoleDashboardPruning.test.js` — the assertion that `ParentDashboard.jsx`/`ChildModal.jsx` exist (Stage 2B's BLOCKED state) is inverted to assert they no longer exist.
- `test/removed-lms-routes.test.js` — removed the one test that read `ParentDashboard.jsx`'s source (file no longer exists), replaced with an explanatory comment; the equivalent `TeacherDashboard.jsx` test was already removed in Stage 2B.
- `test/AdminUsersTab.test.jsx` — removed the `assignTeacher` mock/import and the one test exercising the teacher-assignment `<select>` (control deleted); the role-badge/subscription/family-name tests are unchanged and still pass against the real component.

### Test counts (real runs, this stage)

| Point | Files | Tests |
|---|---|---|
| Stage 2B close (baseline for this stage) | 43 | 293 |
| After this stage's edits, before adding new tests | 43 | 291 (−2: the deleted `assignTeacher` test and the deleted `ParentDashboard.jsx`-reading test) |
| After adding the 3 new test files | 46 | 327 (+36) |

Final full-suite run (foreground, clean): **46 files passed, 327 tests passed, 0 failed.** (A first background attempt hit 7 worker-pool start timeouts under resource contention — an environment/infra symptom, not a real test failure; a clean foreground re-run confirmed the true, fully-green result.)

---

## Part D — verification (Part E of the task)

| Check | Result |
|---|---|
| `check:published-migrations` (`lib/db`) | 4/4 passed |
| `test:db:orchestrator-selftest` (`lib/db`) | 26/26 passed |
| Root `typecheck` (`tsc --build` + all 4 workspace packages) | Clean, no errors |
| Full frontend test suite | 46 files / 327 tests, all passed (see above) |
| Frontend production build | `al-rahma-academy` built successfully (44.20s); `dist/public/assets/` contains no `TeacherDashboard`/`ParentDashboard`/`ChildModal`/`StudentModal`/`AdminStaffTab` chunk. Root `pnpm run build` (recursive, all workspace packages) failed on `artifacts/mockup-sandbox` — a **pre-existing, unrelated** gap: that package's `node_modules/.bin` is entirely empty (dependencies were never installed for it; confirmed via direct inspection), and this task is barred from running package installs. `al-rahma-academy` was built directly and scoped instead, which is the package this stage actually changed. |
| Lint | No real lint script exists at root or in `al-rahma-academy` (confirmed via `package.json` grep) — not applicable, matches every prior stage's finding |
| `git diff --check` | Clean (only benign CRLF-on-checkout warnings, no conflict markers/trailing-whitespace errors) |
| `git status --short` | Matches the intended change set exactly |
| Unused-import spot check | Targeted check on every file where an import line was actually edited (`Profile.jsx`, `AdminUsersTab.jsx`) confirms every remaining imported symbol is used |
| Orphan import/route search | `grep` across `App.jsx`/`dashboardNav.js`/`MobileBottomNav.jsx` for the deleted symbols: only historical comments remain, no live reference |
| Translation-key parity | `i18nParity.test.js` (existing, unmodified) passed as part of the full suite; `roleUser` confirmed present exactly once in each of the 6 locale files |
| Exact deleted-file search | Confirmed absent from the live tree, confirmed still present untouched in `.migration-backup/frontend/src/...` |
| Secrets scan (changed files only) | Clean — no API keys, private-key blocks, or hardcoded credential patterns found |
| `git worktree list --porcelain` | Single worktree (this repository itself); nothing to clean up |
| `public/sitemap.xml` build side-effect | Occurred again (the known, recurring CRLF/LF artifact — confirmed via `git diff --stat` showing no real content diff); restored to HEAD bytes via `git checkout --`, never staged or committed |

---

## Preserved features (explicitly verified untouched)

- Public teacher directory (`Teachers.jsx`, `TeacherProfile.jsx`) — static `TEACHERS` data, no API dependency, unaffected by any deletion in this stage; behaviorally proven reachable without auth in the new test file.
- Trial/Enrollment forms and their `student`/`parent`/`child` **data fields** — no file in this task's scope touches Trial or Enrollment components.
- `preferred_teacher_key`/teacher-snapshot concept — confirmed not present anywhere in current frontend `src/` (schema-only, in `lib/db`), so nothing here could have touched it.
- `AdminDashboard.jsx` shell and all of its surviving tabs (`users`, `courses`, `payments`, `trials`, `newsletter`, `classes`, `reviews`, `community`) plus its "Teachers list" overview card and KPI sublines.
- `AdminUsersTab.jsx`'s subscription actions (renew/deactivate/activate) and family-name editing — confirmed still working (existing tests, updated only where the deleted control required it).
- `Profile.jsx`'s generic account features (name/email edit, password change, subscription display, courses, certificates).
- Generic `Dashboard.jsx`, `AdminDashboard.jsx` shell, `Profile`/`Quran`/`Wishlist`/`Notifications`/`Billing`/`Certificates` — no file in this task's scope touches any of these.

## Orphan inventory (deferred — nothing beyond this stage's named manifest was deleted)

| Item | Classification | Evidence |
|---|---|---|
| `updateUserRole` (`api/adminApi.js`) | **DEFER** | Already zero-consumer before this stage (Stage 2A finding); not in this stage's manifest |
| `GET /parent/link`, `GET /parent/children`, `GET /parent/children/:id`, `DELETE /parent/children/:id`, `GET /auth/link-code` (server endpoints) | **DEFER — frontend-only scope** | Frontend consumers removed; server-side existence/removal is entirely outside this task (no `.env`, no backend, no Remote access) |
| `GET/POST /teacher/*` (backing the deleted `teacherApi.js`) | **DEFER — frontend-only scope** | Same as above |
| `AdminUsersTab.jsx`'s `u.role === 'student'` gate on the family-name column | **UNKNOWN** | Independent of this stage's named symbols; not resolved here |
| `AdminDashboard.jsx`'s `role === 'student'`-derived KPI/Teachers-list card | **ADMIN_CONTENT, reviewed and kept** | Multi-consumer, not zero-consumer, out of this stage's manifest |
| `AdminClassesTab.jsx`'s `role === 'student'` filter | **UNKNOWN** | A separate tab, never named in this task |
| CSS selectors specific to the 4 deleted files | **UNKNOWN (none found)** | Targeted search found no dedicated CSS module for parent/child/teacher-account features; the app's CSS is shared/global, not per-page-modular — matches Stage 2B's identical finding |

## Remaining unknowns / production blockers

- Admin session server-side enforcement remains **UNKNOWN** (unchanged from Stage 2A/2B) — a forged `localStorage.adminUser` can still render the `AdminDashboard` shell briefly; real data/mutation still requires the real httpOnly cookies via the separate `adminHttp` instance. Not this task's to resolve; no Remote access.
- The Supabase-backed database layer (`lib/db`) remains **unconnected** to this frontend — untouched by this task, confirmed by the fact that no file this task edited references it.
- Server-side fate of the now-orphaned `/parent/*`, `/auth/link-code`, `/teacher/*` endpoints is unverified — this task has no ability to check or change that.
- The two UNKNOWN role-field usages logged above (family-name gate, `AdminClassesTab.jsx`) are open, not resolved.

## Confirmation: no Remote/DB/Push/Merge/PR/Deploy

No `.env` file was read. No file under `backend/` was entered. No SQL, migration, or `drizzle` command was run. `lib/db` was not modified — only its pre-existing, read-only guard scripts (`check:published-migrations`, `test:db:orchestrator-selftest`) were executed, both against the already-existing local state. `.migration-backup` was not modified — the 4 deleted files' duplicate copies were located via `find`, never opened. No package install was run. No `git add -A` was used at any point. No Push, Merge, PR, or Deploy occurred at any point.
