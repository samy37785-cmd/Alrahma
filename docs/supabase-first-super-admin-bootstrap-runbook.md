# Supabase first Super Admin: owner runbook

How the owner creates the real Super Admin on Supabase production, accepts
the invite, enrolls MFA, creates the three plans, and collects the unsigned
approval-manifest candidate. Everything here is run **by the owner, in an
interactive PowerShell window**, and nothing here is part of any automated
job. CI never reaches a remote target: all three tools refuse a production
target when `CI` is set.

No secret is ever a command-line flag. Each tool prompts for the email,
password, database URL, keys, invite link and TOTP code with hidden input, so
none of them end up in PowerShell history, the process arguments or a log.
The tools print IDs and statuses only. The commands below contain no secrets.

## Order

| Step | Tool | Writes |
| --- | --- | --- |
| 1 | `supabase-first-super-admin-bootstrap.mjs --apply` | one invite (auth.users), `profiles.role='admin'`, one `super-admin` role row |
| 2 | `supabase-owner-bootstrap.mjs accept-invite` | the owner's password |
| 3 | `supabase-owner-bootstrap.mjs run` | one TOTP factor; the three plans and their three audit rows |
| 4 | `bootstrap-manifest.mjs collect` | nothing in the database; one **unsigned** candidate file |
| 5 | **Stop.** The owner reviews the candidate. Signing it (`plan` scope first) is a separate, later decision. | — |

None of these steps touches `DATA_BACKEND`, Render or Mongo, and none sends a
password reset.

## Prerequisites

- **A clean checkout of the merged commit**, for example
  `D:\GitHub\Alrahma-ops-main` detached at that commit, with `npm ci` run in
  `backend`. On production, the tools refuse a checkout with uncommitted
  changes, and the candidate binds the exact commit.
- **A fresh Mongo backup, at most 24 hours old**, with its backup manifest.
  The bootstrap checks the Super Admin email against every document in it.
  Docker must be running for that check.
- **A dedicated admin email address** that appears nowhere in the Mongo
  source, not even as the same mailbox (`+tag` variants, or Gmail dots). The
  bootstrap checks this itself. You can also check beforehand with
  `node scripts/migration/check-super-admin-email-collision.mjs --backup-manifest=<fresh manifest>`.
  It prints only `SUPER_ADMIN_EMAIL_CONFLICT=YES|NO`.
- **The invite email must be deliverable.** With Supabase's built-in email
  service, mail only reaches the organization's team-member addresses. Either
  add the dedicated address as a team member, or configure custom SMTP under
  Authentication → Emails. If delivery is refused, the bootstrap stops with
  `INVITE_FAILED` and writes nothing.
- **The project's database CA certificate** (Database → SSL Configuration →
  Download certificate), saved privately. Point `SUPABASE_CA_CERT_PATH` at
  it. TLS verification is never disabled.
- **An authenticator app** on your phone, for TOTP.

Set the non-secret switches once in the PowerShell window, from
`D:\GitHub\Alrahma-ops-main\backend`:

```powershell
$env:SUPABASE_BOOTSTRAP_TARGET_ENV = 'production'
$env:SUPABASE_CA_CERT_PATH = 'D:\AlRahma-Private-Backups\<project CA>.crt'
```

## 1. Bootstrap: one invite, one role

```powershell
$env:ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP = '1'
node scripts/ops/supabase-first-super-admin-bootstrap.mjs --apply --confirm-create-first-super-admin --target=production --backup-manifest=D:\AlRahma-Private-Backups\<fresh>.backup-manifest.json
Remove-Item Env:ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP
```

The tool works through these steps in order:

1. It shows `target`, `projectRef` and `gitSha`. The production URL is
   derived from the one hardcoded project ref and is never typed.
2. It asks for the Super Admin email twice, hidden.
3. It checks the email against the fresh backup and prints
   `SUPER_ADMIN_EMAIL_CONFLICT=NO`.
   - On `YES` it stops, and Supabase is never contacted. Choose another
     address.
4. It asks, hidden, for the **database URL** and the **service_role/secret
   key**, and checks both belong to the production project.
5. It runs a read-only preflight. It stops with nothing changed if:
   - an admin role row or an admin profile already exists; or
   - an account with this email or mailbox already exists.
6. It asks you to type `INVITE SUPER-ADMIN difzynyphojgisrfvrkd`.
7. It sends **exactly one** invite. GoTrue emails the link. No password
   exists in this tool.
8. In one transaction, it sets `profiles.role='admin'` and inserts the single
   `super-admin` row, then reads both back. If that write fails, it deletes
   the account this run just invited, and only that account.
9. It prints `SUPER_ADMIN_USER_ID=<uuid>` and `INVITES_SENT=1`. **Write down
   the UUID.** The next steps need it.

A second run stops at `EXISTING_ADMIN_FOUND` and never sends a second invite.

## 2. Accept the invite

The app cannot accept a Supabase invite while Render stays on Mongo, so the
owner tool does it.

**Do not open the invite link.** It works once. Right-click "Accept
invitation" in the email and choose **Copy link address**. Do this soon: the
link expires.

```powershell
node scripts/ops/supabase-owner-bootstrap.mjs accept-invite --target=production --expect-user-id=<SUPER_ADMIN_USER_ID>
```

It asks for these, all hidden:
- the **anon/publishable key** (a service_role or secret key is refused);
- the invite link;
- the new password, twice (at least 12 characters).

The password is checked **before** the one-time link is used, so a typo
doesn't waste it. The tool then:
1. verifies the link;
2. checks the account is `--expect-user-id`;
3. sets the password;
4. signs out of every session.

It prints `INVITE_ACCEPTED=YES` and `PASSWORD_SET=YES`.

If it says `INVITE_LINK_REJECTED`, the link was already opened or has
expired. **Stop.** Recovery is a separate decision.

## 3. MFA and the three plans

```powershell
node scripts/ops/supabase-owner-bootstrap.mjs run --target=production --expect-user-id=<SUPER_ADMIN_USER_ID> --confirm-create-canonical-plans
```

1. It shows `projectRef`, `gitSha`, and the exact plans it will create:
   - Starter 56.00 EUR/month;
   - Standard 84.00 EUR/month;
   - Premium 112.00 EUR/month.

   These are fixed in code, from `backend/config/plans.js`. No flag or input
   can change them.
2. It asks you to type `CREATE CANONICAL PLANS difzynyphojgisrfvrkd`.
3. It asks for the anon key, email and password, hidden, and signs in
   **once**.
4. It stops before MFA if:
   - the account is not `--expect-user-id`;
   - the account is not an admin; or
   - any plans row already exists. Existing plans are never changed.
5. It enrolls TOTP and shows the **QR code (and setup key) in this window
   only**. Scan it, then type the 6-digit code. You get 3 attempts; after 3
   wrong codes the new factor is removed and nothing is created. After
   verification, the QR code is cleared from the screen and the scrollback.
6. It checks that the session is now **AAL2**. Then it checks that this
   account is the **one and only** `admin_role_assignments` row, as
   `super-admin`.
7. It creates the three plans through the official `create_plan_version()`
   RPC. It reads them back, and checks the three `create_plan_version` audit
   rows.
8. It signs out of every session, prints `LOGOUT=OK`, then prints
   `OWNER_USER_ID`, `MFA=VERIFIED factor_id=…`, the three `PLAN <slug>=<uuid>`
   lines and `STATUS=success`.

Close the PowerShell window afterwards.

## 4. Collect the unsigned candidate (read-only)

```powershell
node scripts/migration/bootstrap-manifest.mjs collect --out=D:\AlRahma-Private-Backups\bootstrap-candidate-<date>.json
```

- **Input:** `MIGRATION_DB_URL` is asked for, hidden, unless it is already
  set.
- **Output path:** `--out` must be a new file, in an existing folder outside
  every git repository.
- **How it reads:** a read-only session, inside a `READ ONLY` transaction
  that is rolled back.
- **What it writes:** an **unsigned** candidate holding:
  - the Super Admin UUID;
  - the three plans;
  - the bootstrap audit rows;

  each with its row fingerprint, and no email, name or secret.
- **What it refuses:** a target holding anything a bootstrap cannot leave.
- **What it never does:** sign a manifest, or run a plan.

## 5. Stop

The owner reviews the candidate. Signing comes later, as separate steps:
- `bootstrap-manifest.mjs sign --scope=plan`, with a backup at most 24h old,
  then a read-only production plan;
- `--scope=execute` only after that plan has been reviewed.

## Notes

- **Safe to re-run after a refusal.** Every refusal happens before the step
  it guards: no invite before the preflight and the typed phrase, and no plan
  before AAL2 and the role checks.
- **Tests.** The same code runs end to end in CI, against a disposable local
  Supabase stack with real GoTrue and the Mailpit mail catcher
  (`backend/scripts/ops/operator-tools.real-gotrue.test.mjs`, in
  `npm run test:migration`). It also runs on fakes, in
  `backend/tests/supabase-first-super-admin-bootstrap.test.js`,
  `supabase-owner-bootstrap.test.js` and `operator-tools-guards.test.js`.
