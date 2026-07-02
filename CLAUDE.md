# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Al-Rahma Academy** — full-stack Islamic education platform. React 18 SPA + Express 5 API + MongoDB Atlas. Deployed as a monorepo on Vercel (frontend as pre-built SPA, backend as a single serverless function at `api/index.js`).

## Commands

All commands run from the repo root unless noted.

```bash
# Development (concurrent frontend + backend)
npm run dev

# Install all dependencies
npm run setup

# Build (frontend only, Vite)
npm run build

# Tests
npm test                     # both suites
npm run test:backend         # Node built-in test runner (backend/tests/)
npm run test:frontend        # Vitest (frontend/src/)
npm run test:coverage        # Vitest + v8 coverage report

# Run a single backend test file
cd backend && node --test tests/coupon.test.js

# Run a single frontend test file
cd frontend && npx vitest run src/path/to/test.spec.js

# Linting & formatting (frontend)
cd frontend
npm run lint                 # ESLint
npm run lint:fix             # ESLint auto-fix
npm run format               # Prettier
```

Frontend dev server: `http://localhost:5173`  
Backend API: `http://localhost:5000`  
Vite proxies `/api/*` → `http://localhost:5000` in both dev and preview.

## Architecture

### Backend (`backend/`)

Entry: `app.js` (Express middleware pipeline) → `server.js` (dev runner) → `api/index.js` (Vercel serverless wrapper).

**Middleware pipeline order** (defined in `app.js`):
1. `helmet()` → `cors()` → `express.raw()` (Stripe webhook) → `correlationId`
2. `express.json()` (100 KB limit) → `cookieParser()` → `sanitizeMongo()`
3. `issueCsrfToken` → `verifyCsrfToken` (double-submit cookie pattern)
4. `requestLogger` (Winston with correlation IDs) → DB connection check
5. Route handlers → `notFound` → `errorHandler`

**Patterns:**
- All async route handlers must be wrapped in `asyncHandler()` (from `utils/asyncHandler.js`)
- Input validation uses `express-validator` arrays passed inline to routes
- Error responses always use shape `{ message: "..." }`
- Authentication: httpOnly JWT cookies + refresh token family rotation (`models/RefreshToken.js`)
- Admin sessions require TOTP MFA (`speakeasy`) + IP whitelist check on every request
- CSRF: frontend reads `csrf_token` cookie and sends it as `X-CSRF-Token` header on mutations

**Rate limiting:** Redis-backed in production (set `REDIS_URL`), in-memory fallback in dev. Configured in `config/rateLimit.js` and `config/adminRateLimits.js`.

### Frontend (`frontend/src/`)

Entry: `main.jsx` → `App.jsx` (routes + context providers).

**Context provider stack** (outer to inner):
`ErrorBoundary` → `QueryProvider` (React Query v5) → `ThemeProvider` → `LangProvider` → `AuthProvider` → `BrowserRouter`

**State management:**
- Server state: React Query v5 (`@tanstack/react-query`) — all API calls go through custom hooks in `hooks/`
- Client state: React Context (auth, theme, language)
- Forms: React Hook Form v7

**API layer** (`api/`):
- `client.js` — Axios instance barrel (re-exports from domain files)
- `http.js` — low-level HTTP utility that attaches the CSRF token header
- 15+ domain files: `authApi.js`, `courseApi.js`, `paymentApi.js`, etc.
- `quran.js` — calls the external Quran.com API (not the backend)

**Routing** (`App.jsx`): All page components are lazy-loaded with `React.lazy()` + `Suspense`. Route hierarchy uses hub pages (`/courses`, `/tools`, `/resources`, `/academy`) with nested detail routes. Old flat URLs have redirect entries.

**i18n:** Custom `LangContext` supports 6 languages (en/ar/it/es/de/fr). Strings live in `i18n/` files. Arabic font (Amiri) is lazy-loaded to avoid blocking initial render.

**Dark mode:** `ThemeContext` toggles a CSS class on `<html>`; dark overrides are in `styles/dark.css`.

**Quran module** (`pages/Quran.jsx` + `components/features/quran/`): premium Mushaf reading experience built on top of `api/quran.js` (quran.com API v4 + alquran.cloud). Nav modes: Surah / Page / Juz / Hizb. Page mode renders via `QuranMushafPage.jsx` (continuous flowing RTL text with ornamental frame/margins, `styles/quran-mushaf.css`); other modes use the list-based `QuranVerseList.jsx`. `QuranQuickNav.jsx` is a Ctrl+K / `/` command palette for jumping to surah:verse, page, juz or hizb. Bookmarks, reading goals/streak/history and last-read position persist via `/api/quran-bookmarks` and `/api/quran-progress` (backend models `QuranBookmark`, `QuranReadingProgress`), fetched with React Query hooks (`hooks/useQuranBookmarks.js`, `useQuranProgress.js`) — a different data-fetching approach from the rest of `Quran.jsx`, which still uses raw `useState`/`useEffect` for verse data. `useQuranAudioEngine.js` is a **separate, additive** verse-queue audio engine (Media Session integration, sleep timer, resume-on-reopen) that powers `QuranSyncPlayer.jsx` for Reading-tab verse-sync/repeat-page/repeat-selection playback — it deliberately does not replace `useQuranHifz.js`, which remains the untouched, already-proven Hifz repeat/test engine, to avoid regressing that feature. The Hifz tab's third sub-mode, "Record" (`QuranRecordingStudio.jsx` + `useQuranRecorder.js`), records practice recitations via MediaRecorder and stores them client-side in IndexedDB (`utils/recordingStore.js`, never uploaded) for toggle-playback comparison against the reciter's audio; practice stats persist via `/api/quran-memo` (`QuranMemorizationStats`).

### Models worth knowing

| Model | Purpose |
|---|---|
| `User.js` | Students, teachers, parents (role field) |
| `AdminUser.js` | Separate admin accounts with RBAC + TOTP |
| `Course.js` | Nested structure: modules → lessons |
| `CourseProgress.js` | Per-student lesson completion state |
| `HifzProgress.js` | Quran memorization tracking (surah/verse level) |
| `QuranBookmark.js` | Per-verse Quran bookmarks (one row per user+verse) |
| `QuranReadingProgress.js` | Reading resume position, daily goal, streak/history (one row per user) |
| `QuranMemorizationStats.js` | Recording-studio practice goal/stats/streak (one row per user, separate from `HifzProgress`) |
| `RefreshToken.js` | JWT refresh family rotation (detects reuse) |
| `SystemConfig.js` | Key-value runtime configuration |
| `SystemAuditLog.js` | Immutable admin action log |

### Deployment

- **Vercel** (primary): frontend SPA + single serverless function (`api/index.js`, 30 s max). Daily cron at 09:00 UTC runs renewal reminders via `CRON_SECRET` auth.
- **Render** (alternative backend): `render.yaml` targets `backend/` only.
- **Netlify** (alternative frontend): `netlify.toml` targets `frontend/`.

No Docker. No GitHub Actions CI — deployments are platform-triggered.

## Key environment variables

Backend (see `backend/.env.example`):
- `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `ADMIN_JWT_ACCESS_SECRET` (64-byte hex), `ADMIN_ENCRYPTION_KEY` (64-char hex, for TOTP secrets)
- `CLIENT_URL` — must match the frontend origin for CORS
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
- `SMTP_HOST/PORT/USER/PASS/ADMIN_EMAIL`
- `ADMIN_IP_WHITELIST` — comma-separated IPs/CIDR allowed to hit admin routes
- `CRON_SECRET` — Vercel cron authentication
- `REDIS_URL` — optional; enables distributed rate limiting

Frontend: only `VITE_API_URL=/api` (relative; proxied by Vite in dev).

## Git workflow

- Never commit directly to `main`. Every change goes on a feature branch, gets a descriptive commit message (what changed and why — not placeholders like "fix", "update", "kk"), and opens a PR. Use the `/push` command for this.
- Before committing, review `git diff` — don't commit changes you haven't looked at.

## Brand & content conventions

- Brand name: **Al-Rahma** (not "Al Rahma" or "Alrahma")
- Teaching role: **tutor** in English UI strings
- German: **Koran** (not "Quran")
- Prophet honorific: **ﷺ** (Unicode character, not typed-out text)
update @CLAUDE.md file after each major change and keep it up to date
