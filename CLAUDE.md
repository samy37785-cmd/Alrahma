# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Scope rule for this file:** durable facts only — commands, architecture map, conventions, gotchas. Do NOT journal sprint narratives or change history here; that goes in git history and `docs/history/ENGAGEMENT_LOG.md`. Architectural decisions get a 1-page ADR in `docs/adr/`. Keep this file under ~12KB.

## Project

**Al-Rahma Academy** — full-stack Islamic education platform. React 18 SPA + Express 4 API + MongoDB Atlas. Monorepo: Vercel serves the pre-built frontend SPA only (`vercel.json` rewrites `/api/*` to the Render URL); the backend runs as a standalone, long-running Express process on Render (`backend/`, `node server.js`). There is no serverless API wrapper. `.github/workflows/cron.yml` is the external scheduler that hits `/api/cron/*` (daily renewal reminders, weekly parent reports) with `CRON_SECRET` auth — Render/Vercel run no cron themselves.

The **enterprise refactoring roadmap** (2026-07) is complete through Phase 7 — see PR history (#41–#48) and `docs/audits/` for the originating reports. Its safety nets are permanent: the e2e suite (light + dark baselines), the i18n parity test, and the env-access lint guard. Deliberately deferred work is recorded with reasons in `docs/ROUTE_CONSOLIDATION_PLAN.md` and `docs/adr/` — read those before restructuring routes, the Quran verse loading, or package tooling.

## Commands

All commands run from the repo root unless noted.

```bash
npm run dev                  # concurrent frontend (:5173) + backend (:5000)
npm run setup                # install all dependencies
npm run build                # frontend production build (Vite)
npm test                     # both suites
npm run test:backend         # Node built-in test runner (backend/tests/)
npm run test:frontend        # Vitest (frontend/src/)
npm run e2e                  # Playwright smoke + visual baselines (see e2e/README.md)
npm run e2e:update           # re-baseline screenshots after an INTENDED visual change

# Single test file
cd backend && node --test tests/coupon.test.js
cd frontend && npx vitest run src/path/to/test.spec.js

# Lint / format (frontend); backend has lint only
cd frontend && npm run lint / lint:fix / format
cd backend && npm run lint
```

Vite proxies `/api/*` → `http://localhost:5000` in dev and preview. The e2e suite runs on isolated ports (backend :5100, preview :4300) and can never touch a dev backend or real database.

## Backend (`backend/`)

Entry: `app.js` (middleware pipeline + `validateEnv()`) → `server.js` (runner).

**Middleware order** (app.js): `helmet` → `cors` → `express.raw` (Stripe webhook) → `correlationId` → `express.json` (100KB) → `cookieParser` → `sanitizeMongo` → CSRF (double-submit cookie) → `requestLogger` (Winston + request IDs) → DB-connection check → routes → `notFound` → `errorHandler`.

**Patterns (mandatory):**
- Async route handlers wrapped in `asyncHandler()` (`utils/asyncHandler.js`).
- Validation via express-validator arrays; error responses always `{ message: "..." }`.
- Auth: httpOnly JWT cookies + refresh-token family rotation (`models/RefreshToken.js`). Admin sessions are a separate `AdminUser` system: TOTP MFA + IP whitelist on every request.
- CSRF: frontend calls `GET /api/csrf` (via `ensureCsrfToken()` in `api/csrf.js`, awaited by the axios interceptors) then echoes the `csrf_token` cookie as `X-CSRF-Token` on mutations.
- Pagination via `utils/pagination.js` (`parsePagination`/`sendPaginated`); generic admin CRUD via `controllers/crudController.js` factory — reuse these, don't reimplement.
- ESLint warns on direct `process.env` reads outside `config//scripts//tests/` — read env through a config module.

**Dual route stacks (deliberate, mid-migration):** every privileged admin **mutation** lives under `routes/v1/admin/*` (MFA `AdminUser` session via `verifyAccessToken` + `requirePermissions()` RBAC + `auditFromReq()` audit logging). Legacy top-level route files keep public/student routes and admin **reads** (`protect`+`adminOnly`). No privileged mutation may be added on the legacy stack. Admin accounts are provisioned via `npm run create-admin` (no self-registration). `financialGuard` blocks manual-payment approve/reject while `financials_frozen` is set (super-admin override).

**Rate limiting:** Redis-backed when `REDIS_URL` set, in-memory otherwise; every limiter uses `passOnStoreError: true` (Redis outage fails open, not 500). `/api/v1/admin/*` is limited by both the global `apiLimiter` and `adminApiLimiter` — first cap hit wins.

**Observability:** `/health` = liveness (no DB); `/ready` = readiness (checks mongoose state). Winston logs to console always (Render has no persistent disk) + rotating files in production; `req.requestId` correlates request/error log lines.

## Frontend (`frontend/src/`)

Entry: `main.jsx` → `App.jsx`. Provider stack (outer→inner): `ErrorBoundary` → `QueryProvider` → `ThemeProvider` → `LangProvider` → `AuthProvider` → `AdminAuthProvider` → `BrowserRouter`. All pages lazy-loaded; `RoutePrefetcher` prefetches route chunks via `routePreloadMap.js`.

**State:** server state = React Query v5 via hooks in `hooks/`; client state = contexts (auth/theme/lang); forms = React Hook Form.

**API layer (`api/`):** every backend call goes through the domain files (no raw axios/fetch in components). `http.js` = regular sessions; `adminHttp.js` = `/api/v1/admin/*` (on 401 clears cached admin profile and hard-redirects to `/admin/login`); `quran.js` calls the external quran.com API.

**Admin console:** `/admin` needs both `ProtectedRoute adminOnly` (regular `User` role) and `AdminSessionGate` (separate `AdminUser` TOTP-MFA session from `/admin/login`).

**i18n:** custom `LangContext`, 6 locales in `i18n/{en,ar,it,es,de,fr}.js`. A Vitest parity test (`src/test/i18nParity.test.js`) enforces identical key structure across all six — adding a key to en.js alone fails CI. Never add inline per-page translation dictionaries (several legacy `TXT` objects are being migrated out in roadmap Phase 4). Arabic font (Amiri) lazy-loads on idle except on Arabic-heavy pages (`Quran.jsx`, `Teachers.jsx` call `loadArabicFontsNow()`).

**CSS:** `styles.css` is the global index (tokens → global → layout → auth → pages → components → design-system → dark → responsive; responsive.css must stay last). Page-specific CSS is code-split (imported by its page, not the index). `tokens.css` is a full 3-layer semantic token system; dark mode = `html.dark` overrides in `dark.css` (dark-mode e2e baselines exist — `e2e/dark-mode.spec.mjs`). The three component-CSS generations (`components.css`, `dashboard-shell.css`, `design-system.css`) use **disjoint selector namespaces** (audited: zero collisions) — don't add a fourth.

**Modals:** every new dialog uses `components/ui/Modal.jsx` (`.ds-modal` chrome + `useModalA11y`). Legacy bespoke modals are being migrated one PR at a time — see `docs/adr/0002-single-modal-component.md` for the queue and the two documented exceptions (InvoiceModal's print CSS, QuickTrialModal's intentional marketing styling).

**Quran module** (`pages/Quran.jsx` + `components/features/quran/`): the app's most polished surface — nav modes (Surah/Page/Juz/Hizb) orthogonal to reading modes (Continuous via `QuranMushafPage`, Verse-by-Verse via `QuranVerseList`); notes/highlights persist on `QuranBookmark`; `useQuranAudioEngine` (verse-sync player) is separate from `useQuranHifz` (repeat/test engine) — do not merge them. Verse data still uses raw `useState`/`useEffect` — deliberately: the fetch effect also owns player-state resets, so a React Query swap changes navigation semantics (see docs/ROUTE_CONSOLIDATION_PLAN.md before attempting).

**Honest-data rule:** `HomeworkPage.jsx` and `AttendancePage.jsx` have **no backend** — they render illustrative preview data behind `PreviewBanner` and must not report fake success. The public teacher directory (`data/teachers.js`, `Teachers.jsx`, `TeacherProfile.jsx`) is static editorial content with no real accounts — never wire it to the real review/user systems. Never add localStorage-only "rating" widgets or hardcoded leaderboards; this class of fabricated-social-proof bug has been removed repeatedly.

## Models worth knowing

| Model | Purpose |
|---|---|
| `User.js` | Students, teachers, parents (role field) |
| `AdminUser.js` | Separate admin accounts, RBAC + TOTP |
| `Course.js` / `CourseProgress.js` | modules→lessons; per-student completion |
| `HifzProgress.js` | Quran memorization tracking |
| `QuranBookmark.js` / `QuranReadingProgress.js` / `QuranMemorizationStats.js` | reader persistence (bookmark+note+highlight / resume+streak / recording stats) |
| `RefreshToken.js` | JWT refresh family rotation (reuse detection) |
| `SystemConfig.js` / `SystemAuditLog.js` | runtime config; immutable admin action log |

Notifications: `createNotification()` fires from payment/class/certificate/message/review/cron flows; it accepts `{ session }` for atomicity and silently no-ops when `recipient` is falsy (guest checkouts). The bell badge (`GET /api/notifications/unread`, 30s poll) is independent of the Messages badge (`GET /api/messages/unread/count`).

## Key environment variables

Backend (`backend/.env.example` is the authoritative list): `MONGO_URI`, `JWT_SECRET`, `ADMIN_JWT_ACCESS_SECRET` (64-byte hex), `ADMIN_ENCRYPTION_KEY` (64-char hex), `CLIENT_URL` (must match frontend origin for CORS), Stripe/PayPal/SMTP creds, `CRON_SECRET`, `REDIS_URL` (optional). **`ADMIN_IP_WHITELIST` fails closed in production** — if unset on Render, ALL admin requests are denied. Frontend: only `VITE_API_URL=/api`.

## Git workflow

- Never commit directly to `main`. Feature branch → descriptive commit → PR (use `/push`). Review `git diff` before committing.
- CI (`ci.yml`): backend lint+test, frontend lint+test+build, non-blocking Playwright e2e job. Merging to `main` auto-deploys (Vercel + Render).
- **`frontend/package-lock.json` must be regenerated with npm 10.8.2** (`npx npm@10.8.2 install`), never a newer npm — otherwise npm's optional-deps platform bug (npm/cli#4828) silently drops vitest/rolldown's Linux binding and CI fails with "Cannot find native binding". Prefer incremental `npx npm@10.8.2 install --package-lock-only` over full regeneration; verify with a real `npm ci` before pushing. If a plain `npm install` under a newer npm dirties the lockfile, restore it (`git checkout -- frontend/package-lock.json`) rather than committing it.

## Verification bar for changes

Before a PR: both test suites green (backend `node --test`, frontend Vitest), linters clean, `npm run build` clean. For anything touching rendered UI: `npm run e2e` against the committed screenshot baselines (desktop + mobile); if the visual change is intended, re-baseline with `npm run e2e:update` and eyeball the diff in `playwright-report/`.

## Brand & content conventions

- Brand name: **Al-Rahma** (not "Al Rahma" or "Alrahma"); teaching role: **tutor** in English UI; German uses **Koran** (not "Quran"); Prophet honorific: **ﷺ** (the Unicode character).
- Brand mark: `components/ui/BrandIcon.jsx` (single source of truth; `useId()`-scoped gradients, `tile`/`tone` props) + `BrandLockup.jsx` (icon+wordmark card, Cinzel/Cairo self-hosted). Static duplicates of the same path data live in `favicon.svg`, `og-cover.svg`, `index.html`'s loading screen, and `CertificateCard.jsx`'s print template — changing the mark means updating all of them. The Bismillah renders as real Arabic text in Amiri, never hand-traced paths. og-image is SVG (known limitation: some platforms want raster; noted in-line where relevant).
