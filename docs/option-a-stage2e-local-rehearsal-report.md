# Stage 2E — Local Migration Rehearsal Report

Executed entirely against disposable local Docker containers — never
production MongoDB, never the real Supabase project (`difzynyphojgisrfvrkd`).
No real customer data was used anywhere in this rehearsal.

## Setup

- `stage2e-rehearsal-mongo` — fresh `mongo:7` container, port 27018.
- `stage2e-rehearsal-pg` — fresh `postgres:17` container, port 5434, schema
  applied via `lib/db/test/run-migrations.mjs` (the same tool `lib/db`'s own
  test suite uses — applies `lib/db/drizzle/0000`–`0011` plus the local
  auth-role/auth.uid()/auth.jwt() scaffolding from `local-harness.mjs`).
- Both containers were created fresh for this task and destroyed after the
  rehearsal — nothing from this repo's other local Supabase/Postgres
  containers (e.g. `option-a-rehearsal`, from the separate, unrelated
  Production Cutover Tooling engagement) was read from, written to, or
  otherwise touched.
- Synthetic fixture data only (`backend/scripts/migration/seed-mongo-
  fixture.mjs`): 2 trial requests, 3 subscriber emails (with one deliberate
  duplicate, to test dedup), 2 blog posts (one published, one draft).
- 3 plan rows (Starter/Standard/Premium) seeded into Postgres via the real
  `create_plan_version()` RPC, using the amounts customers currently actually
  pay (`backend/scripts/migration/seed-postgres-plans.mjs`).

## Pipeline run: Mongo fixture → export → transform/validate → Postgres import → API tests → reconciliation

1. **Dry run** (`mongo-to-supabase.mjs --domain=all --dry-run`): exported and
   hashed all 7 fixture documents, wrote nothing, printed exactly what would
   be imported.
2. **Real import**: `trial_requests` 2→2, `subscribers` 3→2 (the duplicate
   email correctly deduplicated via a unique-constraint-driven upsert —
   working as intended, not a bug), `blogs` 2→2.
3. **Idempotency check**: re-ran the exact same import — result was
   `imported=0, unchanged=<all>` for every domain, with the Postgres row
   counts unchanged. Confirms the checkpoint-based idempotency design works.
4. **API tests** (`rehearsal-api-tests.mjs`, the real Express app booted with
   `DATA_BACKEND=supabase` pointed at the rehearsal Postgres): `GET /api/blog`
   correctly listed only the published fixture post; `GET /api/blog/:slug`
   returned the migrated content; `POST /api/newsletter` was idempotent for
   both a migrated and a brand-new email; `POST /api/trials` guest submission
   succeeded. A follow-up manual check confirmed `GET /api/trials` (admin,
   using a locally-signed test JWT) correctly listed both the migrated
   fixture rows and the API-submitted rehearsal row together.
5. **Reconciliation**: final Postgres row counts (2 trial_requests, 2
   subscribers, 2 blogs, plus rehearsal-run growth from the live API tests)
   matched the migration tool's own logged counts exactly; content hashes in
   the checkpoint file matched what dry-run had predicted.

All 4/4 rehearsal API checks passed. This is the strongest evidence available
in this task that the Supabase adapter (for the domains covered) is
functionally correct end-to-end, not just unit-tested in isolation.

## A real bug found and fixed by this rehearsal

The `subscribers` adapter (`backend/data/supabase/subscriberController.js`)
originally used `INSERT ... ON CONFLICT ((lower(email))) DO NOTHING` to make
guest newsletter signups idempotent. Running it for real (as the schema's
`anon` role) failed with `permission denied for table subscribers` — **not**
the already-known "RETURNING requires SELECT" gap, but a deeper one: Postgres
requires SELECT privilege on any column referenced by an `ON CONFLICT`
target expression to evaluate the arbiter index at all, even for a plain `DO
NOTHING` with no `RETURNING`. `anon` has no SELECT grant on `subscribers`
whatsoever. Fixed by doing a bare `INSERT` and catching the resulting
`23505` (unique_violation) error code as "already subscribed" instead —
restores the exact same idempotent 200-either-way contract without needing
any schema/grant change. This is now documented in the adapter's own code
comment and in `docs/option-a-mongo-supabase-parity-map.md`.

A second, smaller issue was found and fixed in `backend/data/supabase/
client.js`: it originally required strict TLS unconditionally, which made it
impossible to connect to any local rehearsal Postgres (no TLS listener).
Fixed by requiring strict TLS for every host except `localhost`/`127.0.0.1` —
a structural check, not a flag, since the real Supabase project is never
local. A third issue was found in `app.js`: the global "ensure DB connected"
middleware unconditionally tried to connect to MongoDB on every `/api/*`
request regardless of `DATA_BACKEND`, which would have 503'd every
supabase-mode request. Fixed by skipping that check when `DATA_BACKEND=
supabase` (documented limitation: under supabase mode, only the matched-
domain routes are expected to work — unmatched-domain routes still depend on
a live Mongo connection this mode doesn't establish).

## Scope of this rehearsal

Covered: `trial_requests`, `subscribers`, `blogs` (the three simplest,
fully-matched, guest/public domains — chosen so the migration tool itself
could be proven correct against real infrastructure without also depending
on the auth/GoTrue path). Full end-to-end rehearsal of the remaining matched
domains (quran_*, notifications, coupons, manual_payments, invoices, auth)
was not executed as a live pipeline run in this pass — those were verified
by their own unit-level review and the standard/contract test suites
instead. Auth (register/login via Supabase Auth/GoTrue) was not rehearsed
end-to-end: doing so would need a full local Supabase stack (Kong + GoTrue +
Postgres, e.g. via `supabase start`), which this task deliberately did not
stand up, to avoid any risk of touching the pre-existing local Supabase
stack already running on this machine for the separate, unrelated Production
Cutover Tooling engagement.

## Teardown

Both rehearsal containers (`stage2e-rehearsal-mongo`, `stage2e-rehearsal-pg`)
were removed after this rehearsal. Nothing from it persists outside this
report, the code fixes it produced, and the (gitignored) local checkpoint/
report files under `backend/scripts/migration/.checkpoints/` and `backend/
scripts/migration/out/`.
