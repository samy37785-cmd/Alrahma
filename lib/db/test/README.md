# Local schema + RLS tests

Real-SQL tests for the 20-table baseline (`docs/product-scope-audit.md`)
and its Row Level Security policies (`docs/rls-matrix.md`), run only
against a throwaway **local** Postgres. Every script here refuses to run
against anything but `localhost`/`127.0.0.1` — each checks
`TEST_DATABASE_URL`'s host and throws immediately otherwise. **Never**
point `TEST_DATABASE_URL` at the real Supabase project.

## Run it yourself

```sh
docker run --rm -d --name alrahma-local-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=alrahma_test \
  -p 55432:5432 postgres:16

# wait for it to accept connections, then:
export TEST_DATABASE_URL="postgres://postgres:test@localhost:55432/alrahma_test"
node test/run-migrations.mjs            # applies lib/db/drizzle/*.sql via drizzle-orm's migrate()
node test/schema.local.test.mjs         # 62 real-SQL assertions (schema, constraints, functions/triggers)
node test/rls.local.test.mjs            # 53 real-SQL assertions (specific RLS findings: bypass closure, forgery prevention, AAL boundaries, concurrency, webhook lease)
node test/rls-full-matrix.local.test.mjs # 51 real-SQL assertions (systematic per-table sweep of docs/rls-matrix.md)

docker rm -f alrahma-local-test-pg # tear down when done
```

- `run-migrations.mjs` creates two kinds of **local-test-harness-only**
  scaffolding before calling `migrate()`, neither of which is ever run
  anywhere near the real project (the real Supabase project already
  provisions all of it):
  - `auth.users` — a minimal stub (`id`, `email`, `raw_user_meta_data`).
    `0000_init_20_table_baseline.sql` intentionally contains **no**
    `CREATE SCHEMA auth`/`CREATE TABLE auth.users` at all (a review
    caught that the migration used to create these, which would fail
    outright against the real project since Supabase already owns them)
    — this stub exists purely so `profiles.id`'s FK to `auth.users.id`
    has something to point at locally.
  - `anon`/`authenticated`/`service_role` Postgres roles (`NOLOGIN`;
    `service_role` additionally `BYPASSRLS`, matching its real
    behavior) plus `auth.uid()`/`auth.jwt()` functions reading the
    `request.jwt.claims` session GUC — the same mechanism
    PostgREST/Supabase use in production. `0002_rls.sql`'s `GRANT`s and
    `CREATE POLICY` clauses reference these roles/functions; locally
    there's no Supabase provisioning, so this step stands in for it.
- `rls.local.test.mjs` and `rls-full-matrix.local.test.mjs` both use a
  single `pg.Client` (not a `Pool`) because `SET ROLE`/session GUCs must
  persist across statements within one session — a real, repeated
  **RLS caveat**: policies are never enforced for a table's owner or a
  superuser, so every test explicitly switches to a non-owner role
  (`anon`/`authenticated`/`service_role`) before the assertion, via
  `SET LOCAL request.jwt.claims = '...'` + `SET ROLE ...`, never
  asserting anything while still the connecting superuser. The
  session-switching mechanics (`asAnon()`/`asUser()`/`asService()`/
  `asSuperuser()`, plus the shared `test()`/`assert()`/`expectReject()`
  scaffolding) live in `rls-helpers.mjs`, imported by both files rather
  than duplicated.
- `rls-full-matrix.local.test.mjs` is a systematic sweep, not a curated
  sample: every `✓`/`✗`/`⊘` cell in `docs/rls-matrix.md` that sits at a
  meaningful boundary gets a real assertion, table by table, distinguishing
  the 3 real failure modes a denial can happen at — RLS filtering to 0
  rows, RLS raising on a failed `WITH CHECK`, and a `GRANT`-layer
  "permission denied" before RLS is even evaluated (see the matrix
  doc's notation section for why these are kept distinct).
- `last-run-output.txt` is a captured, real run — `run-migrations.mjs`
  twice (to prove idempotency across all 4 migration files), then all
  three test scripts — not hand-edited.
