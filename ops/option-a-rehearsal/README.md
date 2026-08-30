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
  --checksum-file out/old-schema-bundle/manifest.json
```

`fixtures/approval-manifest.example.json` is a **LOCAL FIXTURE ONLY** —
its `approvedBy` field is a literal the gate itself refuses under
`--mode production`, and every hash inside it must be regenerated
(`--print-fingerprint-hash`, plus fresh `sha256sum` of every migration/
tool file and the backup bundle's own `manifest.json`) any time the
branch advances, a migration changes, or any checksummed tool script
changes.

## What's committed vs regenerated

Committed: `fixtures/`, `scripts/`, `sql/surgical-reset.sql`,
`sql/inverse-reset-new-schema.sql`, this README,
`supabase/config.toml`.

Gitignored (regenerate by rerunning the steps above): `out/` (dumps,
checksums, inventory snapshots — tied to one ephemeral run), the
`node_modules` symlink, `supabase/.branches` and `supabase/.temp`
(the CLI's own local-state cache).
