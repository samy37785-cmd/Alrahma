# Supabase HTTP Contract Gate — last verified run

Run with: `cd backend && npm run test:supabase-http-contract`

This documents the first real, end-to-end run of
`scripts/test-supabase-http-contract-gate.mjs` +
`tests/contract/supabase-http-contract-gate.contract.test.js` against a
disposable local Postgres (Docker) and a really-booted Express app — not
mocks. It never touched the real Supabase project, Render, Vercel, or Mongo.

## What was proven

12/12 HTTP assertions passed, run twice consecutively from a clean worktree:

- `GET /api/courses` — public catalogue read, returns the seeded fixture course.
- `GET /api/search/teachers` — public teacher directory, correct empty-result shape.
- `GET /api/reviews/teacher/:teacherId` — public review read, correct empty-result shape.
- **Blog locale contract (critical)**: two published rows sharing one slug
  (`locale-matrix-post`), one `locale='en'`, one `locale='ar'`. Proven directly
  by content, not just status code:
  - `GET /api/blog/locale-matrix-post?locale=en` returns the EN title.
  - `GET /api/blog/locale-matrix-post?locale=ar` returns the AR title — a
    **different** row, not the EN one.
  - `GET /api/blog?locale=en` and `?locale=ar` each list exactly one row for
    that slug, with the matching locale.
  - `GET /api/blog` (no locale) and `?locale=fr` (unsupported) both 400.
  - **Result: the locale contract holds.** `?locale=` is not ignored —
    `data/supabase/blogController.js`'s `requireLocale()` + `WHERE locale = $n`
    filtering works correctly end-to-end. No `BLOG_LOCALE_CONTRACT_BROKEN`.
- `POST /api/newsletter` — guest write, 200, real row confirmed directly in Postgres.
- `POST /api/trials` — guest write, 201, real row confirmed directly in Postgres.
- `GET /api/wishlist` (no auth) — 401, not 500 or a silent 200 (negative-authorization proof).

## Direct DB proof (Phase C)

After the HTTP suite ran, queried the container directly (not asserted from
the HTTP layer alone):

```
subscribers_matching_runid=1, trial_requests_matching_runid=1,
subscribers_total=1, trial_requests_total=1, courses_total=1,
blogs_matching_slug=2, migrations_applied=28
```

Then deleted only the run-id-tagged rows and re-verified:

```
post-cleanup counts: subscribers=0, trial_requests=0
```

## Mandatory verification performed

- Ran twice consecutively from a clean worktree — both green, exit code 0,
  each using a freshly random container name/port/password, cleanup verified
  both times.
- Deliberately triggered a failure path (`HTTP_CONTRACT_GATE_PG_IMAGE` pointed
  at a nonexistent image tag): `docker run` failed as expected, the script
  caught it, logged a clear error, ran cleanup anyway (verified: no container
  was ever created), and exited nonzero. No Express process was ever booted
  on that run.
- Tested the non-local-host guard (`assertLocalOnly` from
  `lib/db/test/orchestrator-lib.mjs`) in isolation against a fake
  `evil-not-real.supabase.co` URL: threw immediately, synchronously, before
  any Docker or network action.
- `npm run test:supabase-contract` (the sibling, pre-existing gate) still
  passes unmodified — confirms this file's one-line addition to
  `package.json` didn't affect it.
- `git diff --check`: clean.
- The base `npm test` (Mongo-path) suite was not run to a green result in
  this worktree — it requires a local `backend/.env` with dummy `JWT_SECRET`/
  `MONGO_URI` that was deliberately never created here (out of scope for this
  gate, and this worktree never reads or creates any `.env` file at all).
  Confirmed this is a pre-existing environment-setup prerequisite, not a
  regression: every failure is the same `validateEnv()` "required environment
  variables are not set" error, present before any of this gate's files
  existed.

## What is still out of coverage

Authenticated routes, admin, enrollments/bookings, payments/invoices,
messages, webhooks (Stripe/PayPal), email/WhatsApp delivery — none of these
were touched by this gate, matching its explicitly scoped-down mandate.
