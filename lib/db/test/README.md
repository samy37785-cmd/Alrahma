# Local schema tests

Real-SQL tests for the 20-table baseline (`docs/product-scope-audit.md`),
run only against a throwaway **local** Postgres. Neither script will run
against anything but `localhost`/`127.0.0.1` — both check
`TEST_DATABASE_URL`'s host and throw immediately otherwise. **Never** point
`TEST_DATABASE_URL` at the real Supabase project.

## Run it yourself

```sh
docker run --rm -d --name alrahma-local-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=alrahma_test \
  -p 55432:5432 postgres:16

# wait for it to accept connections, then:
export TEST_DATABASE_URL="postgres://postgres:test@localhost:55432/alrahma_test"
node test/run-migrations.mjs       # applies lib/db/drizzle/*.sql via drizzle-orm's migrate()
node test/schema.local.test.mjs    # 36 real-SQL assertions

docker rm -f alrahma-local-test-pg # tear down when done
```

- `run-migrations.mjs` also ALTERs the local `auth.users` stub to add
  `email`/`raw_user_meta_data` columns — a **local-test-harness-only**
  step. The real Supabase project's `auth.users` already has both
  columns; our own `src/schema/auth.ts` stub is intentionally minimal
  (just `id`, enough for FK typing), so the generated
  `0000_init_20_table_baseline.sql` doesn't create them locally. This
  ALTER is never run anywhere near the real project.
- `last-run-output.txt` is a captured, real run (migrate, migrate again to
  prove idempotency, then the full test suite) — not hand-edited.
