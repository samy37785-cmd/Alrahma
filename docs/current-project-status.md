# Current project status

**This is the current source of truth.** Every other document under `docs/` (rehearsal reports, parity maps, design docs) describes the project **as it stood at the time it was written** — none of them are re-updated as later rounds change the code, and several predate work that has since superseded their conclusions (e.g. earlier parity/rehearsal docs describe schema state `0000`–`0011`; the schema is now at `0022`, and lossless per-domain migration tooling covering all 27 domains has since been built and reviewed). When a historical doc and this one disagree, **this one is correct**; the historical doc is left as-is for its own record of what was true then, not corrected retroactively.

Last verified: PR #70, review round 7 (this document is updated at the end of each review round; see the PR itself for the exact commit this reflects).

## 1. Where production data actually lives today

- **MongoDB is still the production data source.** The live backend (`backend/`) reads and writes MongoDB via Mongoose, exactly as it always has. Nothing about that has changed.
- **No Supabase Production migration or cutover has occurred.** `DATA_BACKEND` has not been changed. No script in `backend/scripts/migration/` has ever been run with real credentials against the real Supabase project (`difzynyphojgisrfvrkd`) or the real Atlas cluster. Every test and rehearsal run in this engagement — across all seven review rounds — has targeted disposable, throwaway local Docker containers (Mongo and/or Postgres, occasionally a local Supabase-CLI GoTrue instance or a minimal Docker HTTP stub), never anything real.
- The Postgres/Supabase schema under `lib/db/drizzle/` (migrations `0000`–`0022`) is fully built and tested — RLS policies, ACL grants, RPCs, the `migration_source_ledger` provenance table — but it is a **target schema for a future migration**, not the backend's live datastore.

## 2. What the migration tooling has actually proven, locally

Local rehearsal (Stage 2J-B Part H) against a full restored copy of the real Mongo dump, in disposable containers only:

- **Dump integrity:** 55/55 documents, 32/32 collections restored exactly; re-dump vs. original — 0 byte-level mismatches.
- **40 of 55 documents (every non-payments domain) migrate losslessly and verifiably**: `users` 7, `courses` 6, `enrollments` 13, `quran_bookmarks` 1, `quran_reading_progress` 1, `quran_memorization_stats` 1, `subscribers` 1, `trial_requests` 10.
- **15 of 55 documents (100% of `payments`) are explicitly, permanently deferred, not migrated, not modified.** Every real payment record uses gateway `paymob`, which the migration tooling's payments adapter does not support (it supports `stripe`/`paypal` only). The original Mongo `payments` data, the `payment_gateway` code, and every payment controller/table are untouched by this entire engagement. Deferral is explicit and operator-controlled: `production-import-orchestrator.mjs` requires `--defer-domains=payments` to skip it — nothing defers it by default, and without that flag the whole run fails closed before any write if `payments` would fail.
- **A run that defers a domain is reported as `status: 'completed_with_deferred'`, never `'reconciled'`.** These are not the same thing, and calling code must inspect `status` (or `deferredDomains.length`), not just `ok`, to tell them apart — `ok` is `true` for both, by design (deferring is a deliberate, acknowledged choice, not a failure).
- **Crash/resume safety** has been proven via deliberate fault injection at each real kill-window (mid-write, between a target write and its ledger acknowledgement, between GoTrue account creation and ledger linkage, mid-transaction for subscriptions/relationships/the migration-seed admin identity) — every window closes to either "fully committed" or "fully rolled back," never a silently-orphaned partial write, across seven rounds of adversarial review.
- **Strict CLI parsing, immutable approval artifacts, and bidirectional ledger integrity** (every target row traces to a ledger entry AND every ledger entry's claimed target still exists) are enforced structurally in the production orchestrator, not by convention.

None of the above has ever been exercised against real production data, real credentials, or a real target project.

## 3. What has NOT happened (and is not close to happening)

- No production Mongo→Supabase import.
- No Supabase Production cutover; `DATA_BACKEND` unchanged.
- No payments migration of any kind, real or planned within this engagement's current scope.
- No Render or Vercel configuration changes.
- No real credential has been read, requested, logged, or committed by any script in `backend/scripts/migration/` — every worker asserts its Postgres target is `localhost`/`127.0.0.1` before doing anything, structurally, not as a convention.

## 4. Review status

Tracked entirely on **PR #70** (`feat/stage-2j-b-lossless-data-migration` → `main`), currently at **review round 7**. The PR has been through seven rounds of adversarial review; each round's blockers are fixed, tested (targeted suites and every full suite, run twice), and documented in the PR description itself, which is the authoritative round-by-round record. **The PR is not merged and is not approved for merge** as of this document's last verification.

## 5. How to verify any of this yourself

See the root [`README.md`](../README.md#test) for the exact test commands. In short: `cd backend && npm run test:all` runs backend lint + backend tests + every migration test file (all against disposable Docker containers only); `cd lib/db && npm run test:db` runs the full Postgres schema/RLS/ACL suite; `cd artifacts/al-rahma-academy && npx vitest run` runs the frontend suite; `pnpm run build` typechecks and builds everything. CI (`.github/workflows/stage2jb-migration-ci.yml`) runs all of these on every PR into `main`, with no repository secrets configured or used.
