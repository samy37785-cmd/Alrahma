# Supabase adapter contract suite — last real, end-to-end verified run

**Update:** this manual run is now automated as a single, repeatable
command — `npm run test:supabase-contract` (see
`scripts/test-supabase-contract.mjs`). That script does everything
described below itself (disposable container, migrations, fixture seed,
real app boot, the contract suite, a direct-DB row check, guaranteed
cleanup) and exits nonzero on any failure. This file remains as the
historical record of the first time this suite was proven to actually
pass, and as a description of what the automated command does under the
hood.

This file exists because `supabase-adapter.contract.test.js` is explicitly
excluded from `npm test` and, per its own header comment, is a
"rehearsal/dev tool" that requires manual local setup — nothing in this
repository's history shows it was ever actually executed against a real
running Postgres + real Express app before this run. Every assertion in
it was, until now, unverified in practice, however correct it looked on
paper. This is the record of the first real run, entirely local, that
proves the Supabase adapter's HTTP contract holds for real — not through
mocks, not through reading the code and reasoning about it.

**This was NOT run against the live Supabase project.** Everything below
happened against a disposable, throwaway local Postgres container,
created and destroyed specifically for this verification, with no
connection whatsoever to `difzynyphojgisrfvrkd` (the real project) or to
Render's live backend.

## What was set up

1. A disposable local Postgres (`docker run --rm -d ... postgres:16`,
   bound to `127.0.0.1` only, random host port).
2. `lib/db/drizzle/*.sql` applied via `lib/db/test/run-migrations.mjs`
   (this migration was numbered 0026 at the time of this run; it was
   renamed to `0027_security_definer_view_hardening.sql` afterward to
   resolve a real numbering conflict with a separately-merged blog-locale
   migration that took 0026 first — the run itself, and everything it
   proved, is unaffected by the rename).
3. Two seed rows inserted directly (superuser, bypassing RLS — this is
   fixture setup, not part of what's under test): one published blog
   post (`runtime-proof-post`) and one unpublished draft
   (`fixture-post-draft-not-published`, the exact slug the test itself
   already checks never leaks).
4. The real Express app (`backend/app.js`) booted in-process by the test
   file itself (`await import('../../app.js')`), with:
   `DATA_BACKEND=supabase`, `SUPABASE_DB_URL` pointing at the disposable
   container above, dummy (non-functional) `SUPABASE_URL` /
   `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET`
   (this suite never calls Supabase Auth/PostgREST — see
   `backend/data/supabase/client.js`'s own header comment: this backend
   talks to Postgres directly via `pg` and never uses supabase-js), and a
   throwaway `JWT_SECRET`/`ADMIN_ENCRYPTION_KEY`/`ADMIN_JWT_ACCESS_SECRET`
   generated fresh for this run only.

## Command

```
DATA_BACKEND=supabase \
SUPABASE_DB_URL=postgres://postgres:***@127.0.0.1:<random-port>/alrahma_runtime_proof \
SUPABASE_URL=http://127.0.0.1:0 SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy \
SUPABASE_JWT_SECRET=*** MONGO_URI=mongodb://127.0.0.1:1/unused JWT_SECRET=*** \
ADMIN_ENCRYPTION_KEY=*** ADMIN_JWT_ACCESS_SECRET=*** NODE_ENV=test \
node --test tests/contract/supabase-adapter.contract.test.js
```

## Result

```
✔ GET /api/blog — matches the Mongo contract: { posts, total, page, pages }, published-only (32811.1946ms)
✔ GET /api/blog/:slug — matches the Mongo contract: { post: {...} }, 404 shape for missing/unpublished (22.3788ms)
✔ POST /api/newsletter — matches the Mongo contract: always 200, idempotent on repeat (320.4535ms)
✔ POST /api/trials — matches the Mongo contract: 201 on a valid guest submission (46.3001ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

The first test's ~33s is one-time Express app cold-start (module imports,
pool creation) inside the test process — not a per-request cost; the
following three requests reuse the same booted app and complete in
20-320ms each.

## Proof these were real writes, not mocks

Queried the disposable Postgres directly, immediately after the run,
before tearing the container down:

```
select email, created_at from subscribers;
                  email                   |          created_at
------------------------------------------+-------------------------------
 contract-test-1790505367042@example.test | 2026-09-27 10:36:07.291481+00
(1 row)

select name, email, course from trial_requests;
         name          |                  email                   | course
-----------------------+------------------------------------------+--------
 Contract Test Visitor | contract-test-1790505367359@example.test | Quran
(1 row)
```

Both rows are exactly what the two `POST` tests submitted — real INSERTs
that went through `backend/data/supabase/subscriberController.js` /
`trialController.js` → `withAnonContext()` → a real transaction against a
real Postgres role (`anon`), not an in-memory fake or a mocked adapter.

## Read path: covers `anon` (guest/public); does not yet cover `authenticated`

This run exercises the **`anon`** role exclusively — `GET /api/blog`
(public read) and the two guest `POST` endpoints (public write via
`withAnonContext`). It does **not** exercise `withUserContext()` (a real
logged-in user) or `withServiceRole()` (webhook-style service writes) —
those remain unverified by an actual end-to-end run and are called out
here explicitly rather than left implied by omission. A follow-up pass
extending this same disposable-Postgres approach to an authenticated
domain (e.g. `quran_bookmarks`, which is `authenticated`-only end to end)
would close that gap; not attempted in this PR to keep its scope to
exactly what was asked for (at least one read path, one safe write path).

## Cleanup

The disposable Postgres container was stopped and removed immediately
after this run and the query above. Nothing from this run persists
anywhere — no state, no container, no data — outside this file's record
of what happened.
