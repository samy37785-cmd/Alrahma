# Stage 2J-B Part H Rehearsal Stack

A disposable, isolated Supabase-CLI-local-stack (`project_id =
"stage2jb-h-rehearsal"`) used for Stage 2J-B Part H's local migration
rehearsal — real GoTrue-backed user migration (`backend/scripts/migration/
migrate-users-to-supabase-auth.mjs`) plus the full non-payments domain set
(`backend/scripts/migration/mongo-to-supabase.mjs`) against the validated
Mongo dump, restored into a separate disposable local Mongo container.

**Never connects to the real Supabase project, to `ops/option-a-rehearsal`'s
stack, or to `ops/stage2f-authtest`'s stack.** Distinct container names
(`supabase_*_stage2jb-h-rehearsal`), distinct ports (55350-55359, vs.
stage2f-authtest's 55320-55329 and option-a-rehearsal's default
54320-54329), distinct Docker volumes. Cloned from `ops/stage2f-authtest`'s
config (project_id and ports adjusted only); Studio, Storage, Realtime,
Analytics, and Edge Runtime remain disabled — this stack only needs
Postgres + GoTrue (Auth) + the local Mailpit mail-catcher.

## Usage

```
npx supabase@2.116.0 start --workdir ops/stage2jb-h-rehearsal
npx supabase@2.116.0 status --workdir ops/stage2jb-h-rehearsal -o env
# apply lib/db/drizzle/*.sql against the real GoTrue-backed Postgres
# (no local auth.users stub -- a real one already exists here):
STAGE2F_AUTHTEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:55352/postgres \
  node lib/db/test/run-migrations-real-gotrue.mjs
npx supabase@2.116.0 stop --workdir ops/stage2jb-h-rehearsal
```

(`run-migrations-real-gotrue.mjs` reads the fixed env var name
`STAGE2F_AUTHTEST_DB_URL` regardless of which local stack it's pointed at —
it only ever asserts the target host is localhost/127.0.0.1, and is reused
here unmodified rather than forked.)

The `ANON_KEY`/`SERVICE_ROLE_KEY`/`JWT_SECRET` printed by `start`/`status`
are the Supabase CLI's well-known, publicly documented local-development
demo credentials (identical on every machine running the same CLI version)
— not project secrets. Nothing here reads or requires a real `.env` file.

## Status as of the Part H rehearsal that created this stack

Payments (15 real records, gateway `paymob`) were explicitly deferred by
product decision — not migrated, not modified, original Mongo data
untouched. Every other domain (users, courses, enrollments, quran_*,
subscribers, trial_requests — 40 records total) was migrated, verified
idempotent (including after simulated local-checkpoint loss), verified
resumable after injected mid-pipeline failure, and verified for correct
rollback. See the Part H report for full detail.
