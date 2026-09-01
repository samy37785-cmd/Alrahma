# Legacy Role Dashboard Pruning (Stage 2B)

**Stage 2B — Close Stage 2A Evidence Gaps and Remove Legacy Role Dashboards.** Local implementation task; no Push/Merge/PR/Deploy; no Supabase/SQL/migrations/RLS/Remote touched.

Starting SHA: `5fac82d7715f8c321a034a1f38fa102d89369a1b` (= `checkpoint/stage-02a-user-admin-contract`, Stage 2A's closing commit)
Branch: `feat/prune-legacy-role-dashboards`
Date: 2026-08-31

Part A's full findings (registration payload re-verification, Admin session behavior, AdminUsersTab, the CalendarPage/DashboardLayout/TeacherDashboard/ParentDashboard diff re-examination, test classification, worktree cleanup) live in `docs/user-admin-auth-contract.md`'s new appendix, not duplicated here — this document covers Part B (the deletions) plus a summary pointer to Part A.

> **Status note (Stage 2C, 2026-09-01):** `ParentDashboard.jsx` and `ChildModal.jsx` — left **BLOCKED** below (Part B, "Files in the manifest NOT deleted") pending an explicit product decision on parent-child linking — were deleted in Stage 2C once that decision was made: the product has no teacher/parent/student account types, only `user`/`admin`, and parent-child linking is out of scope. This document's own historical findings and evidence below are **not rewritten** — they accurately describe why deletion was correctly withheld *at the time this document was written*. See `docs/legacy-role-orphan-cleanup.md` for Stage 2C's full dependency map, the `Profile.jsx`/`getMyLinkCode()` resolution, and everything else Stage 2C deleted/edited on top of this stage's work.

---

## Part A summary (full detail: `docs/user-admin-auth-contract.md` appendix)

| Check | Result |
|---|---|
| Registration payload | Re-traced end to end (`Register.jsx` → `AuthContext.register()` → `authApi.registerUser()` → `http.js`); confirmed `role` is absent at every step, no fix needed |
| Admin session restoration | `adminUser` is restored from `localStorage` as a **local object-shape check only** — no server-side re-validation call on mount. A forged `localStorage.adminUser` can render the AdminDashboard shell briefly, but every real data/mutation call requires the real httpOnly `admin_at`/`admin_rt` cookies via the separate `adminHttp` instance, which self-corrects (clears the forged profile, redirects) within ~1 round trip on the first real call. No code fix made — the only fix available would consume the one-time-use `admin_rt` refresh token proactively on every load, an unproven behavior change this task cannot safely validate without touching Remote. Precisely documented instead. |
| AdminUsersTab | Confirmed accurate; fixed the disabled-role-changes message from hover-only to always-visible; added `AdminUsersTab.test.jsx` (previously zero coverage) |
| CalendarPage/DashboardLayout/AdminUsersTab/TeacherDashboard/ParentDashboard Stage 2A diffs | Re-read every diff line; all traceable to the role-contract or `t.dashboard` fix; nothing unrelated found, nothing reverted |
| Test classification | 7 Stage 2A test files classified (behavioral/API-payload/unit-contract/static-guard); one real gap found (`appRouting.stage2a.test.js` was static-only for redirect behavior) and closed with `appRouting.behavioral.stage2a.test.jsx` (renders the real `App`, real `window.history` navigation) |
| Temporary worktree cleanup | `git worktree list --porcelain` shows exactly one worktree (this repository itself); no `.git/worktrees/` entries beyond it. Nothing existed to clean up. |

---

## Part B — reachability evidence and deletion decisions

### Reachability table (built before any deletion)

| File | Imported by | Runtime entry points | Useful behavior | Safe to delete? | Required companion edits |
|---|---|---|---|---|---|
| `pages/TeacherDashboard.jsx` | Nothing (App.jsx's lazy-import was removed in Stage 2A) | None — `/teacher` redirects to `/dashboard` since Stage 2A | Teacher roster/scheduling/records UI, entirely role-gated, no companion feature elsewhere | **YES** | None beyond its own import (already zero) |
| `components/features/teacher/StudentModal.jsx` | Only `TeacherDashboard.jsx` | None, once `TeacherDashboard.jsx` is gone | Per-student record editor, opened only from the file above | **YES** | None (its only importer is deleted in the same change) |
| `components/features/admin/AdminStaffTab.jsx` | `AdminDashboard.jsx` (Staff tab) | Admin console → Staff tab, `adminOnly`-gated | "Create teacher/parent account" form; already decided DELETE in `product-scope-audit.md` | **YES** | `AdminDashboard.jsx`: remove the import, the `staff` `TABS` entry, the "Staff Management" quick-action, the STAFF TAB panel, and the dead "Manage →" shortcut button (kept the Teachers-list *display* card itself — a separate, still-live read of `listTeachers()`) |
| `pages/ParentDashboard.jsx` | Nothing (App.jsx's lazy-import was removed in Stage 2A) | None — `/parent` redirects to `/dashboard` since Stage 2A | Parent portal: child linking (`linkChild`/`unlinkChild`/`getMyChildren`), reports | **BLOCKED** — see below | N/A |
| `components/features/parent/ChildModal.jsx` | Only `ParentDashboard.jsx` | None on its own | Per-child progress view | **BLOCKED** (follows `ParentDashboard.jsx`'s status — still reachable from the file it belongs to, which is not deleted) | N/A |

### `ParentDashboard.jsx` / `ChildModal.jsx` — BLOCKED, with evidence

`ParentDashboard.jsx` passed the reachability precondition (unreachable via routing since Stage 2A, same as `TeacherDashboard.jsx`). It was **not** deleted because deleting it would silently resolve a product question the Stage 2 Batch 2 audit explicitly left undecided:

- The audit's §12 (Preserved account-feature matrix) classifies "Parent-child link code" as **UNKNOWN/DEFER**: *"whether any parent-child linking survives at all is a product decision outside this audit's authority; flagged as an explicit Batch 2A/2B dependency, not decided here."*
- The audit's §17 repeats this under DEFER: *"Parent-child link code feature ... survives only if a product decision keeps some form of child-linking under the `user` model."*
- **Confirmed by direct inspection**: `Profile.jsx` — a KEEP page, not in any deletion manifest, still fully wired — has a real, live "show my link code" UI (`src/pages/Profile.jsx:60,88-89,394-411`: fetches `getMyLinkCode()`, displays the code, has a working copy-to-clipboard button). This is the **child/user-side half** of the parent-child linking feature, and it is fully functional today.
- `ParentDashboard.jsx` is the **parent-side half** — the only UI anywhere in the app where a parent enters a link code to actually link a child's account (`linkChild`/`unlinkChild`/`getMyChildren` via `parentApi.js`).

Deleting `ParentDashboard.jsx` (and, as its only consumer, `ChildModal.jsx`) would permanently remove the only consumer-side UI for a code that `Profile.jsx` still actively generates and displays to every regular user — a one-sided, dangling feature, and a real product decision ("does parent-child linking survive under the `user` model, and in what form") that this task was not given authority to make. This matches this task's own stop condition: *"وجدت أن حذفه يحتاج حذف Product feature خارج النطاق"* (deleting it would require deleting a Product feature outside this task's scope).

**What did not change as a result of this BLOCKED status:** `/parent` still redirects to `/dashboard` (unchanged since Stage 2A) — the feature is already unreachable via routing regardless of whether the file exists on disk. The only practical effect of BLOCKED here is that the source code remains available on disk (not lost to `.migration-backup`/git history alone) for whatever Batch 2C+ decision eventually resolves this.

---

## Files deleted

| Path | Reason |
|---|---|
| `artifacts/al-rahma-academy/src/pages/TeacherDashboard.jsx` | Unreachable since Stage 2A; zero other importers |
| `artifacts/al-rahma-academy/src/components/features/teacher/StudentModal.jsx` | Only reachable from the file above |
| `artifacts/al-rahma-academy/src/components/features/admin/AdminStaffTab.jsx` | Already decided DELETE in `product-scope-audit.md`; confirmed reachable only via `AdminDashboard.jsx`'s now-removed Staff tab |

Note: each of these 3 names also exists a second time, untouched, at `.migration-backup/frontend/src/...` — the deliberately-preserved historical snapshot. `.migration-backup` was not read, modified, or considered a deletion target anywhere in this task, per the standing constraint.

## Files in the manifest NOT deleted

| Path | Status | Reason |
|---|---|---|
| `artifacts/al-rahma-academy/src/pages/ParentDashboard.jsx` | BLOCKED | Parent-child link-code feature overlap with `Profile.jsx` (see above) |
| `artifacts/al-rahma-academy/src/components/features/parent/ChildModal.jsx` | BLOCKED (follows ParentDashboard.jsx) | Only reachable from the file above, which stays |

## Companion edits

- `App.jsx`: comments updated to reflect the actual per-file Stage 2B outcome (`TeacherDashboard.jsx` deleted; `ParentDashboard.jsx` kept-but-BLOCKED); no route/redirect behavior changed (`/teacher` and `/parent` already redirected to `/dashboard` since Stage 2A).
- `AdminDashboard.jsx`: removed the `AdminStaffTab` import, the `staff` `TABS` entry, the "Staff Management" quick-action button, and the entire STAFF TAB panel (`id="tabpanel-staff"`). The separate "Teachers list" overview card (reads `listTeachers()`, a still-live, unrelated admin feature — also depended on by `AdminUsersTab.jsx`'s still-live teacher-assignment control) was **kept**; only its dead "Manage →" button (which pointed at the now-nonexistent `staff` tab) was removed.
- `utils/nameInitials.js`: corrected a file-list comment naming `TeacherDashboard` as a consumer (it no longer is).
- `AdminDashboard.test.jsx`: removed the now-pointless `AdminStaffTab` mock; corrected a stale tab-count comment.
- `removed-lms-routes.test.js`: removed the `TeacherDashboard.jsx`-specific assertion (the file no longer exists to read); the `ParentDashboard.jsx` assertion is unchanged.

## Legacy redirects that stayed (unchanged from Stage 2A)

`/teacher` and `/parent` were already converted to `<Navigate to="/dashboard" replace />` in Stage 2A — Stage 2B made no routing change. Both are proven, in `legacyRoleDashboardPruning.test.js` and `appRouting.behavioral.stage2a.test.jsx` (Stage 2B) plus `ProtectedRoute.test.jsx`/`appRouting.stage2a.test.js` (Stage 2A), to: use `replace` (no dead history entry); carry no `role=` prop or role-based guard; never render a role-specific dashboard (impossible now for `/teacher` — the component is deleted; still true for `/parent` since the route itself never selected `ParentDashboard.jsx` in the first place, even though the file remains on disk).

## Preserved features (explicitly verified untouched)

- Public teacher directory (`Teachers.jsx`, `TeacherProfile.jsx`) — no diff, both files confirmed present.
- `AdminDashboard.jsx` shell and every other tab (`users`, `courses`, `payments`, `trials`, `newsletter`, `classes`, `reviews`, `community`) — only the `staff` entry removed; the other 9 tabs' imports/registrations untouched.
- Trial/Enrollment, Profile/Quran/Wishlist/Notifications/Billing/Certificates — no files in this task's scope touch any of these.
- `AdminUsersTab.jsx`'s teacher-assignment (`assignTeacher`) and per-student family-name/subscription controls — confirmed still working (`AdminUsersTab.test.jsx`).

## Orphan inventory (deferred to Batch 2C — none deleted in this task)

| Item | Classification | Evidence |
|---|---|---|
| `api/teacherApi.js` (`getMyStudents`, `getStudentDetail`, `addStudentRecord`, `deleteStudentRecord`) | **DELETE_IN_2C** (candidate) | Zero remaining consumers — its only two importers (`StudentModal.jsx`, `TeacherDashboard.jsx`) are both deleted |
| `adminApi.js`'s `adminCreateUser` | **DELETE_IN_2C** (candidate) | Zero remaining consumers — its only importer (`AdminStaffTab.jsx`) is deleted |
| `i18n/{en,ar,it,es,de,fr}.js`'s `teacherDash` top-level key (all 6 locales) | **DELETE_IN_2C** (candidate) | Zero remaining consumers — `TeacherDashboard.jsx` was its only reader. Not deleted here because these files are not otherwise being edited in this task (the stated criterion for an in-task translation deletion). |
| `i18n/{en,ar,it,es,de,fr}.js`'s `parentDash` key | **KEEP_GENERIC_USER** (not orphaned) | Still read by `ParentDashboard.jsx`, which stays (BLOCKED) |
| `authPg.profile.roleTeacher`/`roleParent`/`roleStudent`/`accountType` | **ADMIN_ONLY_KEEP / KEEP_GENERIC_USER** (not orphaned) | Still read by `Profile.jsx`'s role-label display for any legacy-role account |
| CSS selectors specific to the deleted files | **UNKNOWN** (none found) | Targeted search (`teacher`/`staff`-prefixed selectors in `src/styles`) found nothing dedicated; the dashboard shell's CSS is shared, not per-page-modular. Not claimed exhaustive. |
| `lucide-react` icon imports that became newly-unused in files still on disk | **KEEP_GENERIC_USER / none found** | Checked `AdminDashboard.jsx` specifically (the only surviving file with meaningful import-list changes this task made): `UserCog` remains used (Teachers-list card icon); `Download` is unused but was **already** unused before this task touched the file (confirmed via `git show` against Stage 2A's closing commit) — pre-existing, not introduced here, left alone per the same discipline Stage 2A applied to `Save`/`AlertCircle`/`X` |
| `admin_set_role()` (lib/db RPC) | **DEFER** | Still not connected anywhere in this app; unchanged from Stage 2A's finding |

## API endpoints/types deferred

`GET/POST /teacher/*` (backing `teacherApi.js`) and `POST /v1/admin/users` (backing `adminCreateUser`) have no remaining frontend caller after this task, but their server-side existence/removal is entirely outside this task's scope (no `.env`, no backend, no Remote access) — left exactly as-is, noted above for Batch 2C's frontend-side follow-up only.

## Translation/CSS candidates deferred

See the orphan inventory table above — `teacherDash` (6 locale files) is the concrete candidate; no dedicated CSS orphan was located.

## Tests

New: `AdminUsersTab.test.jsx` (5), `appRouting.behavioral.stage2a.test.jsx` (4), `legacyRoleDashboardPruning.test.js` (9). Updated: `AdminDashboard.test.jsx` (mock list trimmed, comment corrected), `removed-lms-routes.test.js` (one assertion removed, net −1 test). See "Full verification" below for before/after counts from real runs.

## Blockers / unknowns

- `ParentDashboard.jsx`/`ChildModal.jsx` deletion — BLOCKED pending an explicit product decision on parent-child linking's fate under the `user` model (see above). This is the only blocker in this task.
- Admin session server-side cookie enforcement — UNKNOWN, unchanged from Stage 2A/the Stage 2 Batch 2 audit; not this task's to resolve (no Remote access).
- External Upstream behavior for every proxied endpoint, including the now-orphaned `teacherApi.js`/`adminCreateUser` ones — UNKNOWN, unchanged.

## Confirmation: no Remote/DB touched

No `.env` file was read. No file under `backend/` (the old untracked directory) was entered. No SQL, migration, or `drizzle` command was run. `lib/db` was not modified (only its pre-existing, read-only guard scripts were executed — see "Full verification" below). `.migration-backup` was not modified (its duplicate copies of the 5 manifest filenames were identified by `git ls-files` but never opened, read, or touched). No Push/Merge/PR/Deploy occurred at any point.

## Full verification

See the final report for exact before/after test counts, typecheck/build/lint results, and the `published-migrations`/orchestrator-self-test guard results (both unaffected, re-run against the unmodified `lib/db`).
