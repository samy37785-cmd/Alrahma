# Al-Rahma Academy

An online Quran, Arabic, and Islamic studies academy: public marketing/learning pages plus student, teacher, parent, and admin experiences.

This README describes the **current architecture and how to run/test it**. For the current state of the Mongo→Supabase migration effort specifically (what has and has not happened), see [`docs/current-project-status.md`](docs/current-project-status.md) — that document is the single current source of truth on migration status; historical design/rehearsal reports elsewhere under `docs/` describe work as it stood at the time they were written and are not re-updated as the branch progresses.

## Architecture (current)

- **Backend** (`backend/`): Node.js + Express REST API, backed by **MongoDB** (Mongoose) as the production datastore. Auth, payments (Stripe), courses, enrollments, subscriptions, admin, etc. all live here today.
- **Frontend** (`artifacts/al-rahma-academy/`): React + Vite single-page app (Tailwind, React Router/wouter, React Query).
- **`lib/db/`**: A Postgres/Supabase schema (Drizzle ORM migrations `0000`–`0022`), RLS/ACL policies, and RPCs — built and tested as **Stage 2J-B**'s target schema for a future Mongo→Supabase migration. This schema is fully built and tested locally; it is **not** the backend's live datastore today (see status doc).
- **`backend/scripts/migration/`**: The Mongo→Supabase migration tooling itself (lossless per-domain transforms, a DB-side `migration_source_ledger` for idempotency/provenance, fault-injection-tested crash recovery, and a production-import orchestrator with approval-manifest/backup/signups-off preflight gates). Reviewed across multiple rounds on PR #70; **never yet run against Supabase Production**.
- Workspace is managed with **pnpm** (see `pnpm-workspace.yaml`): `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`.

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

**See [`docs/current-project-status.md`](docs/current-project-status.md) for the authoritative, current answer.** In one line: MongoDB remains the production source of truth; the Supabase schema and migration tooling are built and locally rehearsal-tested but **no production import or cutover has occurred**; `payments` is explicitly deferred (real records use an unsupported gateway); PR #70 tracks this work and is not yet approved for merge.
