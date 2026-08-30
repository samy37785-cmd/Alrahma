# Option A Rehearsal

A reusable, disposable Supabase-CLI-local-stack rehearsal for the
Option A ("drop and rebuild `public`") reconciliation decision. Every
script here targets `127.0.0.1`/`localhost` only. **Nothing here has
ever connected to the real project (`difzynyphojgisrfvrkd`).**

See `docs/option-a-rehearsal-report.md`, `docs/option-a-backup-restore.md`,
`docs/option-a-cascade-scope.md`, `docs/option-a-consumer-audit.md`, and
`docs/option-a-migration-review.md` for the actual findings this
tooling produced. This README is just "how to rerun it."

## Prerequisites

Docker Desktop running. No global Supabase CLI install needed — every
command below uses `npx supabase`.

## Rerun it end to end

```sh
cd ops/option-a-rehearsal
npx supabase start                      # real Postgres 17 + Auth + PostgREST + Kong, local only
ln -s ../../lib/db/node_modules node_modules   # so run-migrate.mjs resolves pg/drizzle-orm

# 1. Load the reconstructed old-remote-state fixture (the "before Option A" state)
cat fixtures/old_public_schema.sql | docker exec -i -e PGPASSWORD=postgres supabase_db_option-a-rehearsal psql -U postgres -d postgres -v ON_ERROR_STOP=1

# 2. Backup rehearsal (pre-drop inventory, dump, cross-schema artifacts)
bash scripts/01-pre-drop-inventory.sh out
bash scripts/02-dump.sh out
bash scripts/02b-dump-cross-schema-artifacts.sh out

# 3. (Optional) disaster + restore rehearsal — see docs/option-a-backup-restore.md
#    for the exact restore sequence that was actually proven to work
#    (public-schema dump + the 2 function files + the 2 trigger files —
#    NOT a naive whole-database pg_dump/restore, which was tried and
#    documented as failing on Supabase-internal function definitions).

# 4. The real Option A sequence
docker exec -e PGPASSWORD=postgres supabase_db_option-a-rehearsal psql -U postgres -d postgres -c "drop schema if exists public cascade;"
docker exec -e PGPASSWORD=postgres supabase_db_option-a-rehearsal psql -U postgres -d postgres -c "
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
"
REHEARSAL_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" node scripts/run-migrate.mjs

# 5. Tear down when done
npx supabase stop
```

## The production preflight gate

`scripts/production-preflight-gate.mjs` is a **check-only** script meant
for later, separate use against the real project — see the large
comment block at its top. It was tested exclusively against this local
rehearsal stack (both failing and passing runs — see
`docs/option-a-rehearsal-report.md`). It never runs by itself, is never
invoked by any other script here, and a passing result does not trigger
any apply step.

## What's committed vs regenerated

Committed: `fixtures/`, `scripts/`, this README, `supabase/config.toml`.
Gitignored (regenerate by rerunning the steps above): `out/` (dumps,
checksums, inventory snapshots — tied to one ephemeral run), the
`node_modules` symlink, `supabase/.branches` and `supabase/.temp`
(the CLI's own local-state cache).
