# Option A Rehearsal

A reusable, disposable Supabase-CLI-local-stack rehearsal for the
Option A ("surgically reset and rebuild the 34 old tables inside
`public`, without ever dropping `public` itself") reconciliation
decision. Every script here targets `127.0.0.1`/`localhost` only.
**Nothing here has ever connected to the real project
(`difzynyphojgisrfvrkd`).**

See `docs/option-a-rehearsal-report.md`, `docs/option-a-backup-restore.md`,
`docs/option-a-cascade-scope.md`, `docs/option-a-consumer-audit.md`,
`docs/option-a-migration-review.md`, and
`docs/option-a-surgical-reset-design.md` for the actual findings this
tooling produced. This README is just "how to rerun it."

**Round 2 note:** the `DROP SCHEMA public CASCADE` + broad
`ALTER DEFAULT PRIVILEGES ... GRANT ALL` sequence this README used to
document below was rejected after a code review (it forces hand-
reconstructing `public`'s owner/ACL/`pg_default_acl` from scratch, and
relies on CASCADE's traversal to reach cross-schema objects rather than
naming them explicitly). It has been replaced everywhere — in this
README and in the tooling — by **Surgical Reset**
(`sql/surgical-reset.sql` via `scripts/03-surgical-reset.mjs`): an
explicit, named-object-only reset that drops exactly the 34 old tables
and 3 old enums and never touches `public` itself. See
`docs/option-a-surgical-reset-design.md` for why.

## Prerequisites

Docker Desktop running. No global Supabase CLI install needed — every
command below uses `npx supabase`.

## Rerun it end to end

```sh
cd ops/option-a-rehearsal
npx supabase start                      # real Postgres 17 + Auth + PostgREST + Kong, local only
ln -s ../../lib/db/node_modules node_modules   # so run-migrate.mjs/03-surgical-reset.mjs resolve pg/drizzle-orm

# 1. Load the reconstructed old-remote-state fixture (the "before Option A" state)
cat fixtures/old_public_schema.sql | docker exec -i -e PGPASSWORD=postgres supabase_db_option-a-rehearsal psql -U postgres -d postgres -v ON_ERROR_STOP=1

# 2. Backup rehearsal — real pg_dump --schema=public (not hand-rolled DDL).
#    Produces a restorable custom-format dump (public_schema.dump), a
#    review-only plain-text copy, the cross-schema artifacts pg_dump -n
#    public cannot capture (the auth.users trigger + the event trigger),
#    a full inventory.json (tables, row counts, RLS state, full policy
#    definitions, enums, functions), and a manifest.json with a sha256
#    per file plus sourceMode/projectRef.
BACKUP_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
BACKUP_MODE=local \
BACKUP_PROJECT_REF=local-rehearsal-not-real \
BACKUP_OUT_DIR="$(pwd)/out/old-schema-bundle" \
node scripts/backup-bundle.mjs

# 3. (Optional) disaster + restore rehearsal, including a genuine
#    new-schema -> old-schema ROLLBACK (not just restoring into an
#    empty database) — see docs/option-a-surgical-reset-rehearsal.md
#    for the full proof. In short:
RESTORE_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
RESTORE_MODE=local \
RESTORE_BUNDLE_DIR="$(pwd)/out/old-schema-bundle" \
RESTORE_ROLLBACK_FROM_NEW_SCHEMA=yes \
node scripts/restore-bundle.mjs

# 4. The real Option A sequence: Surgical Reset (named-object-only —
#    never touches the public schema itself, its owner/ACL, or
#    pg_default_acl), then migrate().
RESET_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" node scripts/03-surgical-reset.mjs
REHEARSAL_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" node scripts/run-migrate.mjs

# 5. Tear down when done
npx supabase stop
```

## The production preflight gate

`scripts/production-preflight-gate.mjs` is a **check-only** script meant
for later, separate use against the real project — see the large
comment block at its top. It was tested exclusively against this local
rehearsal stack (both failing and passing runs — see
`docs/option-a-rehearsal-report.md` and
`docs/option-a-surgical-reset-rehearsal.md`). It never runs by itself,
is never invoked by any other script here, and a passing result does
not trigger any apply step.

As of Round 2 (v3) it takes the database connection string only via a
`GATE_DATABASE_URL` environment variable, never a CLI flag:

```sh
GATE_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
node scripts/production-preflight-gate.mjs \
  --mode local \
  --project-ref difzynyphojgisrfvrkd \
  --confirm-token "I-UNDERSTAND-THIS-WILL-DROP-PRODUCTION-difzynyphojgisrfvrkd" \
  --approval-manifest fixtures/approval-manifest.example.json \
  --dump-file out/old-schema-bundle/public_schema.dump \
  --checksum-file out/old-schema-bundle/manifest.json \
  --ca-cert-file out/prod-ca-2021.crt
```

`--ca-cert-file` is required only in `--mode production` (Supabase's pooler/
direct hosts use a project-specific CA, not a publicly-trusted one — see
the v4 comment at the top of `production-preflight-gate.mjs`). Download it
from the project's own dashboard: Project Settings > Database > SSL
Configuration > Download certificate. It is a public certificate, safe to
keep in `out/` (gitignored) or paste anywhere — never a secret.

`fixtures/approval-manifest.example.json` is a **LOCAL FIXTURE ONLY** —
its `approvedBy` field is a literal the gate itself refuses under
`--mode production`, and every hash inside it must be regenerated
(`--print-fingerprint-hash`, plus fresh `sha256sum` of every migration/
tool file and the backup bundle's own `manifest.json`) any time the
branch advances, a migration changes, or any checksummed tool script
changes.

## Production orchestrators (never run against production by this repo)

`scripts/production-cutover-orchestrator.mjs` and
`scripts/production-rollback-orchestrator.mjs` are the only two tools in
this repo authorized to touch the real Alrahma project — and neither has
ever been run against it. Both share their critical-section logic with
`scripts/lib/cutover-core.mjs` / `scripts/lib/rollback-core.mjs`, which
is exactly what `test/cutover-core.test.mjs`, `test/rollback-core.test.mjs`,
and `test/concurrency.test.mjs` exercise directly (against local Postgres
only) — the tests run the SAME code the production tools do, not a
reimplementation of it.

**Shared advisory lock.** Both tools derive their lock key from
`scripts/lib/shared-lock.mjs`'s `sharedAdvisoryLockKey(projectRef)` — the
SAME key for both cutover and rollback. A corrective review caught that
the original design used two different keys ("option-a-cutover:<ref>" vs
"option-a-rollback:<ref>"), so a cutover and a rollback run could both
acquire their own lock and proceed concurrently without either seeing
the other — the mutex only worked within one tool, not across the two.
`test/concurrency.test.mjs` proves the fix directly: cutover-vs-cutover,
cutover-vs-rollback, and rollback-vs-rollback all correctly serialize on
the shared key. The lock is acquired on ONE connection and held for the
tool's ENTIRE critical section — through commit or rollback — never
released and reacquired partway through.

**Cutover is a single atomic transaction.** The final recheck, Surgical
Reset, all pending migrations, the migration journal, and the full
post-migration verification all run as plain SQL on ONE already-locked
connection, inside ONE `BEGIN ... COMMIT`. `COMMIT` only happens after
verification passes; any error at any point issues `ROLLBACK`
automatically — nothing from a failed run is ever left committed. This
is possible because drizzle-orm's own `migrate()` cannot be used for
this (it opens its own internal transaction and commits before control
returns to the caller — see `cutover-core.mjs`'s module doc for the
exact mechanism); instead the migration files are read with
drizzle-orm's own `readMigrationFiles()` (same hash/journal format) and
applied as plain queries on the shared connection. `test/cutover-core.test.mjs`
proves this with real failure injection at three points (right after
Surgical Reset, mid-migration, and right after verification but before
COMMIT) and asserts the old 34-table fixture is back, byte-for-byte,
after each one.

**Rollback's honesty about its own atomicity boundary.** Unlike cutover,
a rollback's `pg_restore` step is an external subprocess with its own
connection and its own `--single-transaction` boundary — it cannot share
one Postgres transaction with the rest of the rollback run. Rather than
claim false atomicity, `scripts/lib/rollback-core.mjs` uses three
independently-safe boundaries (inverse-reset's own begin/commit,
pg_restore's own `--single-transaction`, and the auth-trigger-restore
step's own explicit transaction — the last one is a real bug fix: it
used to be a bare loop of auto-committing statements) and documents
exactly what state each one's failure leaves behind.
`test/rollback-core.test.mjs` proves every one of those states with
failure injection: after the target check (nothing touched), after the
inverse reset (a clean, empty intermediate state — not corrupt, just
incomplete), after `pg_restore` (old schema+data back, triggers
correctly not yet applied), and during the trigger-restore transaction
(neither of its two statements left applied). The order is also fixed:
`sql/inverse-reset-new-schema.sql` always runs — and is verified gone —
*before* `pg_restore` ever executes.

**No bypass flag.** The rollback orchestrator's target check requires
the live public schema to be EXACTLY the expected new (post-cutover)
20-table schema before touching anything — there is no `--allow-nonempty`
flag anywhere in this codebase to widen that check. A target that
doesn't match must be investigated and resolved by a human.

**Re-verification under the lock, not preflight-only.** The cutover
orchestrator runs the full `production-preflight-gate.mjs` TWICE: once
before requesting the lock (fail fast), and once again immediately after
acquiring it, right before `BEGIN` — closing the gap between "the gate
checked a moment ago" and "the lock is held and something is about to
change." The rollback orchestrator independently verifies its backup
bundle's checksums, `sourceMode`, `projectRef`, and freshness
(`generatedAt` age) itself, rather than relying on any separate process
having done so.

## What's committed vs regenerated

Committed: `fixtures/`, `scripts/`, `sql/surgical-reset.sql`,
`sql/inverse-reset-new-schema.sql`, this README,
`supabase/config.toml`.

Gitignored (regenerate by rerunning the steps above): `out/` (dumps,
checksums, inventory snapshots — tied to one ephemeral run), the
`node_modules` symlink, `supabase/.branches` and `supabase/.temp`
(the CLI's own local-state cache).
