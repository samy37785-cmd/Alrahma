# Al-Rahma Academy

An online Quran, Arabic, and Islamic studies academy: public marketing/learning pages plus student, teacher, parent, and admin experiences.

This README describes the **current architecture and how to run/test it**. For the current state of the Mongo→Supabase migration effort specifically (what has and has not happened), see [`docs/current-project-status.md`](docs/current-project-status.md) — that document is the single current source of truth on migration status; historical design/rehearsal reports elsewhere under `docs/` describe work as it stood at the time they were written and are not re-updated as the branch progresses.

## Architecture (current)

- **Backend** (`backend/`): Node.js + Express REST API, backed by **MongoDB** (Mongoose) as the production datastore. Auth, courses, enrollments/bookings, subscriptions, admin, etc. all live here today. Stripe/PayPal/manual-payment gateway code still exists (see "Enrollment & payments model" below) but is no longer reachable from the customer-facing frontend.
- **Frontend** (`artifacts/al-rahma-academy/`): React + Vite single-page app (Tailwind, React Router/wouter, React Query).
- **`lib/db/`**: A Postgres/Supabase schema (Drizzle ORM migrations `0000`–`0025`), RLS/ACL policies, and RPCs — built and tested as **Stage 2J-B/2J-C**'s target schema for a future Mongo→Supabase migration. This schema is fully built and tested locally; it is **not** the backend's live datastore today (see status doc).
- **`backend/scripts/migration/`**: The Mongo→Supabase migration tooling itself (lossless per-domain transforms, a DB-side `migration_source_ledger` for idempotency/provenance, fault-injection-tested crash recovery, and a production-import orchestrator with approval-manifest/backup/signups-off preflight gates, plus a closed-by-default Production Enablement gate from Stage 2J-C). Reviewed across multiple rounds on PR #70 and PR #71 (both merged to `main`); **never yet run against Supabase Production**.
- Workspace is managed with **pnpm** (see `pnpm-workspace.yaml`): `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`.

## Enrollment & payments model (Booking-First Enrollment)

There is **no in-app online payment** anywhere in the customer-facing frontend: a student picks a plan, submits a booking request (name, WhatsApp, country, timezone, availability, plan, notes), gets a booking reference and a pre-filled WhatsApp link, and pays off-site — an admin then activates their subscription manually from the admin dashboard. No card, bank, or account credential is ever collected by this site.

- Booking requests reuse the pre-existing `Enrollment` model/API (`POST /api/enrollments`, admin CRUD at `/api/v1/admin/enrollments`) rather than a new resource, with additive fields (`bookingRef`, `agreedAmount`, `currency`, `paymentMethodExternal`, `paidAt`, `renewalAt`, `adminNote`) and two extra status values (`awaiting_payment`, `paid`).
- The Stripe/PayPal/manual-payment gateway integrations, routes, models, and all historical `Payment`/`Invoice`/`ManualPayment` records are **untouched and still legacy/deferred** — nothing here deletes or migrates them; the admin manual-payment review tab still works for historical records. See `docs/current-project-status.md` §5 for the full writeup.

## Run

- Backend dev server: `cd backend && npm run dev` (nodemon; needs a local `.env` — see `backend/`'s own docs/env references, never commit real credentials)
- Frontend dev server: `cd artifacts/al-rahma-academy && npm run dev` (Vite, `--host 0.0.0.0`)
- Root build (typecheck + build every workspace package): `pnpm run build`

## Test

| Command | What it runs | Needs |
|---|---|---|
| `cd backend && npm test` | Backend's own test suite (`backend/tests/**/*.test.js`) | Nothing external (mongodb-memory-server) |
| `cd backend && npm run lint` | Backend ESLint | — |
| `cd backend && npm run test:migration` | **Every** Stage 2J-B migration test file (`backend/scripts/migration/**/*.test.mjs`) | Docker (spins up disposable, throwaway Mongo/Postgres containers per test file; nothing external, nothing persistent) |
| `cd backend && npm run test:all` | Lint + `npm test` + `npm run test:migration`, in order | Docker |
| `cd lib/db && npm run test:db` | Full RLS/ACL/schema/upgrade-scenario suite against a disposable Postgres | Docker |
| `cd artifacts/al-rahma-academy && npx vitest run` | Frontend unit/component tests | — |

**`npm test` in `backend/` never runs the migration suite** — its glob (`tests/**/*.test.js`) and the migration suite's file extension/location (`scripts/migration/**/*.test.mjs`) are structurally disjoint. Run `npm run test:migration` (or `test:all`) explicitly to exercise the migration tooling; CI (`.github/workflows/stage2jb-migration-ci.yml`) runs all of the above on every PR into `main`.

## Deployment

The backend and frontend deploy through this project's existing hosting configuration (Render for the API, Vercel for the frontend historically) — this repository's automation does not manage or trigger those deploys, and nothing in `backend/scripts/migration/` touches Render, Vercel, or any live deploy target. `DATA_BACKEND` and all production credentials are operator-managed outside this repo; no script here reads, requests, or logs one.

## Mongo → Supabase migration status

**See [`docs/current-project-status.md`](docs/current-project-status.md) for the authoritative, current answer.** In one line: MongoDB remains the production source of truth; the Supabase schema and migration tooling are built and locally rehearsal-tested but **no production import or cutover has occurred**; `payments` is explicitly deferred (real records use an unsupported gateway, and is now additionally out of scope of the customer-facing app after Booking-First Enrollment); PR #70 and PR #71 are both merged to `main`.
