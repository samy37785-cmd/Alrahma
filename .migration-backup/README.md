# Al-Rahma Academy

Full-stack Islamic education platform: online Quran, Arabic, and Islamic
studies with one-on-one tutoring, subscriptions, and a student/teacher/parent/
admin dashboard suite.

**Live site:** https://al-rahmaacademy.com

## Stack

| Layer | Tech | Hosted on |
|---|---|---|
| `frontend/` | React 18 SPA (Vite, React Query v5, React Router) | Vercel (static build; `/api/*` rewritten to Render) |
| `backend/` | Express 4 + Mongoose 8 REST API | Render (long-running `node server.js`) |
| Database | MongoDB Atlas (replica set) | Atlas |

## Quick start

```bash
npm run setup       # install frontend + backend dependencies
cp backend/.env.example backend/.env   # then fill in values (see docs/DEPLOY.md)
npm run dev         # frontend on :5173, backend on :5000 (proxied)
```

## Commands (repo root)

```bash
npm run dev             # concurrent frontend + backend dev servers
npm run build           # production frontend build (Vite)
npm test                # backend (node:test) + frontend (Vitest) suites
npm run test:backend    # backend only
npm run test:frontend   # frontend only
npm run e2e             # Playwright smoke + visual baselines (see e2e/README.md)
```

Linting/formatting live in each package: `cd frontend && npm run lint` /
`npm run format`; `cd backend && npm run lint`.

## Repository layout

```
frontend/        React SPA (src/pages, src/components, src/hooks, src/api, src/i18n, src/styles)
backend/         Express API (controllers, services, models, routes, middleware, config)
e2e/             Playwright smoke + screenshot-baseline suite
docs/            Living documentation (see docs/README.md for the index)
docs/adr/        Architecture decision records
docs/audits/     Dated, point-in-time audit reports (historical)
docs/history/    Engagement/sprint narrative log (historical)
CLAUDE.md        AI-assistant working conventions (commands, architecture map, gotchas)
```

## Documentation

- [docs/README.md](docs/README.md) — documentation index
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture
- [docs/API.md](docs/API.md) — API surface overview
- [docs/DEPLOY.md](docs/DEPLOY.md) — deployment (Vercel + Render) and environment variables
- [docs/TESTING.md](docs/TESTING.md) — test strategy
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow and conventions

## Deployment

- **Vercel** serves the pre-built SPA; `vercel.json` rewrites `/api/*` to the Render backend.
- **Render** runs the backend as a standalone process (`render.yaml`); health probe at `/health`, readiness at `/ready`.
- CI (`.github/workflows/ci.yml`) runs backend + frontend lint/test/build and a non-blocking Playwright e2e job on every push/PR. Merging to `main` auto-deploys via the Vercel/Render GitHub integrations.
