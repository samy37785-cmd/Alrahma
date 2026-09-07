# Route Parity Gate

Automated, repeatable check for Stage 2F's route-parity requirement. Not
wired into a GitHub Actions workflow (this repo has no `.github/workflows`
directory) — run it manually or wire it into whatever CI/build step is
added later.

## Run

```
cd backend
JWT_SECRET=... ADMIN_JWT_ACCESS_SECRET=... \
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_JWT_SECRET=... SUPABASE_DB_URL=... CLIENT_URL=... \
npm run route-parity-gate
```

Point the `SUPABASE_*`/`SUPABASE_DB_URL` vars at any real local Supabase
CLI stack with `lib/db/drizzle`'s migrations applied (e.g.
`ops/stage2f-authtest`, `ops/option-a-rehearsal`) — never a real project.
`MONGO_URI` is not required; the mongodb-mode half only enumerates the
route graph, it never opens a real Mongo connection.

## What it checks

1. **Structural parity** — every `{method, path}` registered under
   `DATA_BACKEND=mongodb` must also exist under `DATA_BACKEND=supabase`.
   Walks the real, live Express router graph (via `express-list-endpoints`)
   rather than a hand-maintained route-file checklist, so it can't drift
   out of date the way a written list would.
2. **Live smoke pass** under `DATA_BACKEND=supabase` — fires an
   unauthenticated request at every enumerated route (skipping only routes
   with a `:param`/`*` segment this script has no safe value to fabricate)
   and fails on:
   - any `501`
   - any `/api/v1/admin/*` route (other than the public `/auth/*` login
     entry points) answering with `2xx` given zero credentials — an
     RBAC/JWT/AAL2 bypass
   - any response body mentioning Mongo/mongoose/a Mongo connection error
     while running under `DATA_BACKEND=supabase` — a leaked Mongo
     dependency

Everything else (`400`/`401`/`403`/`404`/`409`/`422`, or a `500` with no
Mongo signature) is recorded in the matrix but **not** auto-failed — most
routes need real seeded business state a blind, credential-less smoke pass
can't fabricate, so a bare 500 there isn't proof of a missing adapter on
its own. That deeper, per-domain correctness (RLS/RPC authorization,
pagination, idempotency, transaction rollback, ...) is covered by the much
more thorough `rehearsal-*.mjs` scripts under `backend/scripts/migration/`
— this gate's job is the three failure classes above plus structural
coverage, not a replacement for those.

## Output

Console summary + a full route matrix written to `last-run-report.md`
(gitignored — regenerate on demand) in this directory. Non-zero exit code
on any failure, so it's CI-wireable as-is.
