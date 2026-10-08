# Local dev stack (Supabase)

A disposable Supabase CLI stack for running the whole app on this machine
(Postgres + Auth + PostgREST + Kong + Mailpit). Project `alrahma-local-dev`,
ports 54421 (API) / 54422 (DB) / 54424 (mail UI). Studio, analytics, realtime,
storage and edge functions are disabled to keep the image pulls small.
Nothing here ever touches the real project (`difzynyphojgisrfvrkd`).

## Set up (once)

```sh
cd ops/local-dev
npx supabase start          # needs Docker; DB image pinned in supabase/.temp/postgres-version
node migrate.mjs            # applies lib/db/drizzle/*.sql (refuses non-local hosts)
npx supabase status -o env  # copy the keys into ops/local-dev/.env.backend (gitignored)
```

`.env.backend` needs: `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWT_SECRET`.

## Run

From the repo root: `npm run start`. `scripts/dev-all.mjs` starts the backend
(port 5000) with those overrides — they shadow `backend/.env`, and the launcher
refuses to start if they point anywhere but 127.0.0.1/localhost — plus the
frontend (port 3000). Delete `.env.backend` to run on local MongoDB instead.

Stop the stack with `npx supabase stop`.
