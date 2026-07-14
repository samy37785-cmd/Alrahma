# Documentation index

## Living documentation (kept current)

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture: frontend, backend, data flow |
| [API.md](API.md) | REST API surface overview |
| [DEPLOY.md](DEPLOY.md) | Deployment (Vercel + Render) and environment variables |
| [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | Pre-deploy verification checklist |
| [POST_LAUNCH_CHECKLIST.md](POST_LAUNCH_CHECKLIST.md) | Post-launch verification checklist |
| [MONITORING.md](MONITORING.md) | Health probes, logging, alerting |
| [TESTING.md](TESTING.md) | Test strategy and how to run suites |
| [../e2e/README.md](../e2e/README.md) | Playwright e2e smoke + visual-baseline suite |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution workflow (repo root) |
| [../CLAUDE.md](../CLAUDE.md) | AI-assistant working conventions (repo root) |

## Decision records

- [adr/](adr/) — one page per architectural decision. Add a new ADR whenever a
  decision would otherwise live only in a PR description or someone's memory.
- [ROUTE_CONSOLIDATION_PLAN.md](ROUTE_CONSOLIDATION_PLAN.md) — the queued
  migration of admin reads onto `/api/v1/admin/*`, plus other explicitly
  deferred refactors and their reasons.

## Historical (point-in-time, not maintained)

- [audits/2026-07/](audits/2026-07/) — the July 2026 backend/frontend audit
  reports, patch plans, independent reviews and verification records that
  preceded the enterprise refactoring roadmap.
- [releases/](releases/) — v1.0.0 release notes and the v1.1.0 roadmap document.
- [history/ENGAGEMENT_LOG.md](history/ENGAGEMENT_LOG.md) — verbatim sprint
  narrative previously accumulated in CLAUDE.md.
