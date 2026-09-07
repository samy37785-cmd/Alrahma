# Stage 2F Auth Test Stack

A disposable, isolated Supabase-CLI-local-stack (`project_id =
"stage2f-authtest"`) used only for Stage 2F's real-GoTrue rehearsals:
password-reset E2E (`backend/scripts/migration/rehearsal-password-reset-e2e.mjs`)
and the auth-migration rehearsal
(`backend/scripts/migration/rehearsal-auth-migration-real-gotrue.mjs`).

**Never connects to the real Supabase project or to `ops/option-a-rehearsal`'s
stack.** Distinct container names (`supabase_*_stage2f-authtest`), distinct
ports (55320-55329, vs. option-a-rehearsal's default 54320-54329), distinct
Docker volumes.

Studio, Storage, Realtime, Analytics, and Edge Runtime are disabled in
`config.toml` — this stack only needs Postgres + GoTrue (Auth) + the local
Mailpit mail-catcher, kept minimal on purpose.

`templates/recovery.html` overrides GoTrue's recovery email to link straight
at our own frontend's `/reset-password?token={{ .TokenHash }}&type=recovery`
instead of GoTrue's default `{{ .ConfirmationURL }}` — see
`docs/option-a-mongo-supabase-parity-map.md`'s "Stage 2F closure" section for
why, and for the required (not yet done, out of scope here) production
Dashboard change this implies.

## Usage

```
npx supabase@2.116.0 start --workdir ops/stage2f-authtest
npx supabase@2.116.0 status --workdir ops/stage2f-authtest -o env
# apply lib/db/drizzle/*.sql against the real GoTrue-backed Postgres:
STAGE2F_AUTHTEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  node lib/db/test/run-migrations-real-gotrue.mjs
npx supabase@2.116.0 stop --workdir ops/stage2f-authtest
```

The `ANON_KEY`/`SERVICE_ROLE_KEY`/`JWT_SECRET` printed by `start`/`status`
are the Supabase CLI's well-known, publicly documented local-development
demo credentials (identical on every machine running the same CLI version)
— not project secrets. Nothing here reads or requires a real `.env` file.
