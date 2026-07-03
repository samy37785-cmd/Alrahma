# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Al-Rahma Academy** — full-stack Islamic education platform. React 18 SPA + Express 4 API + MongoDB Atlas. Deployed as a monorepo: Vercel serves the pre-built frontend SPA only; the backend runs as a standalone, long-running Express process on Render (`backend/`, started via `node server.js`). `vercel.json` rewrites every `/api/*` request to the Render URL — there is no `api/index.js` serverless function in this repo.

## Commands
when chenge in any new task i wont to create a commit 
All commands run from the repo root unless 
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

Entry: `app.js` (Express middleware pipeline) → `server.js` (runner, used both in dev and as the Render start command — there is no separate serverless wrapper).

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

**Routing** (`App.jsx`): All page components are lazy-loaded with `React.lazy()` + `Suspense`. Route hierarchy uses hub pages (`/courses`, `/tools`, `/resources`, `/academy`) with nested detail routes. Old flat URLs have redirect entries. `RoutePrefetcher` (mounted in `App.jsx`) prefetches a route's chunk ahead of navigation — on link visibility (idle-scheduled `IntersectionObserver`) or on `touchstart`/`pointerdown` — using the path→import map in `routePreloadMap.js`; this closes the serial "entry bundle finishes → then route chunk starts" gap that mobile field testing showed adding 700ms-1.5s+ per navigation on slow connections.

**i18n:** Custom `LangContext` supports 6 languages (en/ar/it/es/de/fr). Strings live in `i18n/` files. Arabic font (Amiri) is lazy-loaded on idle (`utils/loadArabicFonts.js`) to avoid blocking initial render — except on Arabic-text-heavy pages (`Quran.jsx`, `Teachers.jsx`), which call `loadArabicFontsNow()` immediately on mount instead of waiting for idle, since the fallback→Amiri font swap was measured as a real source of layout shift (CLS) on those pages under throttled mobile networks.

**CSS:** `styles.css` is the global index (`styles/tokens.css`, `global.css`, `layout.css`, `auth.css`, `pages.css`, `components.css`, `dark.css`, `responsive.css`). Anything only needed by specific pages is code-split — imported directly by the page/component that needs it, not added to the global index — including `quran.css`/`khatm.css`/`tasbeeh.css`/`islamic-tools.css`/`adhkar.css`/`dashboard.css` and, as of the mobile performance pass, `hifz.css` (→ `Quran.jsx` + `HifzReviewPage.jsx`) and `trust-engage.css` (→ `Home.jsx` + `Dashboard.jsx`). Coverage-API field testing showed 90-96% of the global CSS was unused on any given page before this split.

**Dark mode:** `ThemeContext` toggles a CSS class on `<html>`; dark overrides are in `styles/dark.css`.

**Home page** (`pages/Home.jsx`): ~16 marketing sections. Everything below the fold (`Courses` through `Newsletter`) is wrapped in `DeferredSection` (`components/ui/DeferredSection.jsx`), which mounts its children only once an `IntersectionObserver` reports the section is about to scroll into view (600px root margin, so the mount finishes before the user actually gets there). Field testing measured 1.5s+ of main-thread blocking from mounting all sections synchronously on first render before this change.

**Quran module** (`pages/Quran.jsx` + `components/features/quran/`): premium Mushaf reading experience built on top of `api/quran.js` (quran.com API v4 + alquran.cloud). Nav modes: Surah / Page / Juz / Hizb (what content is loaded/browsed) are orthogonal to **Reading Mode**: Continuous vs. Verse-by-Verse (how it renders) — a segmented `ReadingModeSwitch.jsx` toggle, persisted to `localStorage['qlc-reading-mode']`, drives which renderer is used regardless of nav mode. Continuous mode renders via `QuranMushafPage.jsx` (flowing RTL text with ornamental frame/margins, `styles/quran-mushaf.css`) — generalized to accept any loaded verse array (single page, full surah, juz or hizb, up to ~300 verses), not just page-sized data; Verse-by-Verse mode uses the list-based `QuranVerseList.jsx`. Switching modes never refetches — both renderers read the same already-loaded `verses` state.
- **Page-turn navigation** (Continuous mode): tap zones (left/right ~22% edge bands, center toggles immersive chrome), swipe (`hooks/useSwipeNavigation.js` — hand-rolled touch-delta threshold, no gesture library), and keyboard arrows all call one consolidated `goRelative(dir)` handler in `Quran.jsx`, which reuses each nav mode's existing prev/next unit semantics (prev/next surah, page±1, juz±1, hizb±1). `useQuranKeyboard.js` no longer owns per-mode arrow-key logic directly — it just calls `goRelative`.
- **Immersive chrome**: tapping the center of the continuous reading viewport toggles `chromeHidden`, collapsing the top bar / mode switch / controls bar via CSS max-height transitions (`.qlc--chrome-hidden`); auto-resets on tab or reading-mode change.
- **Mobile sidebar**: `QuranSidebar.jsx` is an off-canvas drawer below 900px (slide-in + backdrop, opened via a `☰` toggle in `QuranTopBar.jsx`), replacing an earlier "squeeze into a 240px box above content" layout that ate vertical space needed for near-fullscreen reading.
- **Notes & highlights**: per-verse note (textarea popover) and highlight (5-color swatch picker) live in `QuranVerseList.jsx`'s action row, both persisted on the same `QuranBookmark` row (`note`, `color` fields) via the existing upsert `POST /api/quran-bookmarks` — saving either one auto-bookmarks the verse, since there's no note/highlight-only row in the schema. Highlight also renders (read-only tint) inside `QuranMushafPage.jsx`.
- **Reading settings**: `SettingsPanel` (`QuranControls.jsx`) adds a Light/Sepia/Dark reading theme (`qlc--sepia` CSS class, independent of the global `ThemeContext` dark toggle), a line-height slider, and a content-width preset (Narrow/Medium/Wide) — applied via CSS custom properties (`--reading-line-height`, `--reading-max-width`) set on the page root.

Bookmarks, reading goals/streak/history and last-read position persist via `/api/quran-bookmarks` and `/api/quran-progress` (backend models `QuranBookmark`, `QuranReadingProgress`), fetched with React Query hooks (`hooks/useQuranBookmarks.js`, `useQuranProgress.js`) — a different data-fetching approach from the rest of `Quran.jsx`, which still uses raw `useState`/`useEffect` for verse data. `useQuranAudioEngine.js` is a **separate, additive** verse-queue audio engine (Media Session integration, sleep timer, resume-on-reopen) that powers `QuranSyncPlayer.jsx` for Reading-tab verse-sync/repeat-page/repeat-selection playback — it deliberately does not replace `useQuranHifz.js`, which remains the untouched, already-proven Hifz repeat/test engine, to avoid regressing that feature. The Hifz tab's third sub-mode, "Record" (`QuranRecordingStudio.jsx` + `useQuranRecorder.js`), records practice recitations via MediaRecorder and stores them client-side in IndexedDB (`utils/recordingStore.js`, never uploaded) for toggle-playback comparison against the reciter's audio; practice stats persist via `/api/quran-memo` (`QuranMemorizationStats`).

The Reading Mode / page-turn / notes / highlights / reading-theme system above applies only to `Quran.jsx` — it is the only verse-structured reading surface in the app. `CourseContent.jsx`'s text-type lessons are plain paragraphs (no Arabic/translation duality, no audio, no verse structure) and intentionally do not use this system.

### Models worth knowing

| Model | Purpose |
|---|---|
| `User.js` | Students, teachers, parents (role field) |
| `AdminUser.js` | Separate admin accounts with RBAC + TOTP |
| `Course.js` | Nested structure: modules → lessons |
| `CourseProgress.js` | Per-student lesson completion state |
| `HifzProgress.js` | Quran memorization tracking (surah/verse level) |
| `QuranBookmark.js` | Per-verse Quran bookmarks (one row per user+verse); also carries an optional `note` and highlight `color` |
| `QuranReadingProgress.js` | Reading resume position, daily goal, streak/history (one row per user) |
| `QuranMemorizationStats.js` | Recording-studio practice goal/stats/streak (one row per user, separate from `HifzProgress`) |
| `RefreshToken.js` | JWT refresh family rotation (detects reuse) |
| `SystemConfig.js` | Key-value runtime configuration |
| `SystemAuditLog.js` | Immutable admin action log |

### Deployment

- **Vercel** (live, frontend only): serves the pre-built `frontend/dist` SPA and rewrites `/api/*` to the Render backend URL (see `vercel.json`). No `crons` key is configured here — Vercel does not run any scheduled job, because it does not host the API.
- **Render** (live, backend): `render.yaml` runs `backend/` as a standalone `node server.js` process — not a serverless function. Health check at `/health`.
- **Renewal-reminder cron** (`GET /api/cron/renewal-reminders`, `CRON_SECRET` auth): must be triggered by a scheduler **external to this repo** (e.g. UptimeRobot, GitHub Actions cron) hitting the Render URL daily — `render.yaml` documents this requirement inline, but no such scheduler is configured anywhere in this repository. Confirm one exists before relying on renewal reminders actually sending.
- **Netlify** (`netlify.toml`, present but not live): an alternate frontend-hosting config that exists in the repo but isn't referenced by the live CSP/redirect config — status as an active deployment target is unconfirmed.

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
- `CRON_SECRET` — authenticates the external scheduler's call to `/api/cron/*` (there is no Vercel cron — see Deployment above)
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
