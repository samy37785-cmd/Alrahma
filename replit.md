# Al-Rahma Academy

An online Quran, Arabic, and Islamic studies academy with public learning tools and student, teacher, parent, and admin experiences.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/al-rahma-academy run dev` — run the web app through its managed workflow
- `pnpm --filter @workspace/al-rahma-academy run test` — run the imported frontend test suite
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Optional env: `UPSTREAM_API_ORIGIN` — override the imported academy API origin used by the Replit proxy

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React, Vite, React Router, React Query
- API gateway: Express 5
- Existing product data: the imported academy API and its existing MongoDB-backed service
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/al-rahma-academy/` — migrated web application, routes, styles, tests, and public media
- `artifacts/api-server/` — same-origin `/api` gateway and local health endpoint
- `.migration-backup/` — untouched source import retained for migration reference

## Architecture decisions

- Preserve the existing React Router application and axios API modules rather than rewriting the product around scaffold hooks.
- Route browser API traffic through Replit's `/api` artifact so the frontend remains same-origin and no Vercel rewrite is required.

## Product

- Quran courses, Tajweed, Hifz, Arabic, Islamic studies, blog and academy information
- Quran reader, adhkar, hadith, prayer, qibla, calendar, tasbeeh, alphabet, and review tools
- Enrollment, authentication, billing, messaging, AI tutor, community, and role-specific dashboards

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The frontend artifact is mounted at `/`; keep public asset and React Router paths root-relative.
- The local `/api/healthz` route is handled by Replit; all other `/api` routes are forwarded to the imported academy backend.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
