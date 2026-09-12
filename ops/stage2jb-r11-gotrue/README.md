# Stage 2J-B Round 11 — Real GoTrue Correlation Test Stack

A disposable, isolated Supabase-CLI-local-stack (`project_id =
"stage2jb-r11-gotrue"`) used only by
`backend/scripts/migration/real-gotrue-correlation.test.mjs` (PR #70 review
round 11, item 1) — proving `migrateOneUser()`/`migrateOneAdmin()`'s
`raw_app_meta_data.migration_correlation_id` read-back holds against a REAL
GoTrue instance, not just a hand-seeded Postgres row.

**Never connects to the real Supabase project, to `ops/option-a-rehearsal`'s
stack, or to `ops/stage2f-authtest`'s stack.** Distinct container names
(`supabase_*_stage2jb-r11-gotrue`), distinct ports (55440-55449), distinct
Docker volumes.

Storage, Realtime, Studio, Analytics, Edge Runtime, and the local mail
catcher are all disabled — this stack only ever needs Postgres + GoTrue
(Auth), fronted by Kong so `@supabase/supabase-js`'s
`auth.admin.createUser()` reaches it exactly the way production code does.

The test file that owns this stack starts it, applies `lib/db/drizzle/*.sql`
against the real GoTrue-managed Postgres, runs its assertions, then always
runs `supabase stop --no-backup` in a `finally` — the Docker volumes this
stack's Postgres data lives in are fully wiped at the end of every run, the
same disposability guarantee every other Docker-backed test in this
directory already provides via a plain `docker run --rm`.

The `ANON_KEY`/`SERVICE_ROLE_KEY`/`JWT_SECRET` the CLI prints are the
Supabase CLI's well-known, publicly documented local-development demo
credentials (identical on every machine running the same CLI version) — not
project secrets. Nothing here reads or requires a real `.env` file.
