# Supabase first super-admin bootstrap runbook

Operational order for creating the **first** Supabase-native admin identity
(`auth.users` + `profiles.role='admin'` + `admin_role_assignments.role=
'super-admin'`) ahead of a future `DATA_BACKEND=supabase` cutover. No
secrets or real values are recorded in this document.

This runbook describes a **future, separately-authorized operation**. None
of the steps below have been executed as part of the change that added
this file or the tool it references — see `docs/current-project-status.md`
for the project's current, actual `DATA_BACKEND` state (still `mongodb`).

## Why this tool exists

`admin_set_admin_role()` (`lib/db/drizzle/0013_admin_rbac.sql`) — the
normal, in-app way to grant an admin role — itself requires the caller to
already be a super-admin with a real AAL2 (MFA-verified) session. There is
deliberately no self-service or ordinary-admin-gated way to create the very
first one. `backend/scripts/ops/supabase-first-super-admin-bootstrap.mjs`
is that one, offline, operator-run exception — the Supabase-side equivalent
of `backend/scripts/createAdminUser.js` on the Mongo side, with a different
mechanism underneath: no password ever touches this tool (see below).

## Prerequisites

- The target Supabase project's schema already includes migrations through
  at least `0013_admin_rbac.sql` (the `admin_role_assignments`/
  `role_permissions` tables and the `handle_new_user()` trigger that
  auto-creates a `profiles` row on signup).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` are
  all set in the environment this tool actually runs in (never passed as a
  CLI argument — this tool refuses to accept any secret that way, matching
  every other script under `backend/scripts/`).
- `CLIENT_URL` is set if you want the invite email's link to point back at
  this project's own `/admin/login` page (optional — GoTrue falls back to
  its own default redirect otherwise).

## No password ever exists inside this tool

The new identity is created via `supabase.auth.admin.inviteUserByEmail()`.
Supabase Auth itself creates the `auth.users` row with **no password set**
and (in a real run) emails a real invite link; the owner sets their own
password by following it. This tool never generates, accepts, stores, or
prints a password of any kind.

## Procedure

1. **Dry-run first, from anywhere (no environment variables required at
   all for the bare form):**
   ```
   node backend/scripts/ops/supabase-first-super-admin-bootstrap.mjs
   ```
   Confirms the tool loads and explains what `--apply` will require. Makes
   no connection of any kind.

2. **Decide the target environment and set its matching env var.** Before
   ever passing `--target=staging` or `--target=production`, set
   `SUPABASE_BOOTSTRAP_TARGET_ENV` to that exact same value in the
   environment the command will actually run in. These are two
   independent channels (a CLI flag typed at invocation time, an env var
   configured separately ahead of time) that must agree — a single
   mistyped `--target` can never silently point a "staging" intent at the
   real production project, or vice versa.

3. **Apply, with every gate satisfied:**
   ```
   ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1 \
     node backend/scripts/ops/supabase-first-super-admin-bootstrap.mjs \
       --apply \
       --confirm-create-first-super-admin \
       --target=staging \
       --email=owner@example.com
   ```
   All of the following must hold, checked before any connection is made:
   - `--apply`
   - `--confirm-create-first-super-admin` (a second, independent
     acknowledgement — `--apply` alone is never enough)
   - `ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1` in the environment
   - `--target` matches `SUPABASE_BOOTSTRAP_TARGET_ENV` exactly
   - `--email` is a syntactically valid address

4. **The tool then, in order:**
   - Refuses outright (no writes, no Auth call) if any
     `admin_role_assignments` row already exists, or if `profiles` already
     has a `role='admin'` row with no matching `admin_role_assignments`
     row (an ambiguous state it will not try to resolve on your behalf).
   - Refuses to touch a pre-existing `auth.users` account for the given
     email unless `--confirm-promote-existing-account` was **also** passed
     — a third, separate acknowledgement from step 3's flags.
   - Otherwise invites a brand-new account (no password set), then — in
     one Postgres transaction — sets `profiles.role='admin'`, inserts the
     `admin_role_assignments` row with `role='super-admin'`, and re-reads
     both back before committing.
   - If the profile/role write fails after a brand-new account was just
     created, deletes that exact newly-created account again
     (`auth.admin.deleteUser`, by the id this run itself just received —
     never a fresh lookup, never an account it did not create itself) and
     reports `failed_compensated`. If the account being promoted already
     existed before this run, a write failure is reported as-is and
     **nothing is deleted** — investigate manually.

5. **Confirm delivery out-of-band.** This tool never prints the invite
   link or any token — ask the new admin to check their inbox (and spam
   folder) for the Supabase invite email, or check Supabase Studio's
   Authentication → Users page for the new account's status.

6. **First login.** The new super-admin signs in at `/admin/login` under
   `DATA_BACKEND=supabase` after setting their password via the invite
   link; TOTP MFA enrollment happens automatically on that first login
   (same UX as the Mongo `AdminUser` path), since the account starts with
   zero MFA factors by design.

## Notes

- Every log line this tool prints is a mode, a target name, or a
  `{status, createdByThisRun, promoted}` summary — never an email,
  password, token, link, or secret value.
- The tool only ever touches, at most, one `auth.users` row, one
  `profiles` row, and one `admin_role_assignments` row per run — never a
  bulk operation, never a second admin (it refuses outright once any
  admin exists at all).
- Safe to re-run after a refusal: nothing is written until every gate
  passes and the pre-flight checks come back clean.
