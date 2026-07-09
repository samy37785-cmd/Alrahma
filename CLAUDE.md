# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Al-Rahma Academy** — full-stack Islamic education platform. React 18 SPA + Express 4 API + MongoDB Atlas. Deployed as a monorepo: Vercel serves the pre-built frontend SPA only; the backend runs as a standalone, long-running Express process on Render (`backend/`, started via `node server.js`). `vercel.json` rewrites every `/api/*` request to the Render URL — there is no `api/index.js` serverless function in this repo.

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

Entry: `app.js` (Express middleware pipeline) → `server.js` (runner, used both in dev and as the Render start command — there is no separate serverless wrapper).

**Middleware pipeline order** (defined in `app.js`):
1. `helmet()` → `cors()` → `express.raw()` (Stripe webhook) → `correlationId`
2. `express.json()` (100 KB limit) → `cookieParser()` → `sanitizeMongo()`
3. `issueCsrfToken` → `verifyCsrfToken` (double-submit cookie pattern)
4. `requestLogger` (Winston with correlation IDs) → DB connection check
5. Route handlers → `notFound` → `errorHandler`

**Observability:** `/health` is a liveness probe (always fast, no DB check); `/ready` is a readiness probe that additionally checks `mongoose.connection.readyState`, so it accurately reports 503 if MongoDB drops the connection at runtime, not just before the first successful connect. Winston logs to Console always (Render has no persistent disk configured — see `render.yaml` — so file-only logging in production would be unrecoverable after a restart) plus rotating files when `NODE_ENV=production`; `errorHandler` and `requestLogger` both include `req.requestId` so a request's error log line and its completion log line can be correlated. `config/db.js` logs `mongoose.connection` `disconnected`/`reconnected`/`error` events at runtime, not just the initial connect.

**Patterns:**
- All async route handlers must be wrapped in `asyncHandler()` (from `utils/asyncHandler.js`)
- Input validation uses `express-validator` arrays passed inline to routes
- Error responses always use shape `{ message: "..." }`
- Authentication: httpOnly JWT cookies + refresh token family rotation (`models/RefreshToken.js`)
- Admin sessions require TOTP MFA (`speakeasy`) + IP whitelist check on every request
- CSRF: frontend reads `csrf_token` cookie and sends it as `X-CSRF-Token` header on mutations

**Admin API (`/api/v1/admin/*`):** the only privileged-mutation surface in the app. Every admin mutation route — user role/subscription/teacher/family management, staff account creation, manual-payment review, course/enrollment CRUD, blog post CRUD, coupon CRUD, contact-message status updates, certificate issue/revoke, and referral conversion — lives under `routes/v1/admin/` (`usersRoutes.js`, `paymentsRoutes.js`, `coursesRoutes.js`, `enrollmentsRoutes.js`, `blogRoutes.js`, `couponsRoutes.js`, `contactRoutes.js`, `certificatesRoutes.js`, `referralsRoutes.js`, `reviewsRoutes.js`), gated by `verifyAccessToken` (TOTP-MFA `AdminUser` session, `admin_at`/`admin_rt` cookies) + `requirePermissions()` RBAC + `auditFromReq()` audit logging. The corresponding legacy top-level route files (`routes/authRoutes.js`, `paymentRoutes.js`, `courseRoutes.js`, `enrollmentRoutes.js`, `blogRoutes.js`, `couponRoutes.js`, `contactRoutes.js`, `certificateRoutes.js`, `referralRoutes.js`, `reviewRoutes.js`) now expose **only** public/student-facing routes and admin **reads** (e.g. `GET /api/coupons`, `GET /api/contact`, `GET /api/certificates` are intentionally still `protect+adminOnly` — only mutations were migrated); no route in this app authenticates a privileged *mutation* via the regular `User`/`protect`/`adminOnly` path anymore. `financialGuard` (`middleware/maintenanceGuard.js`) is wired at the route level on `PATCH /api/v1/admin/payments/manual/:id` only (not router-wide), blocking approve/reject while `financials_frozen` is set, with a `super-admin` emergency override. RBAC permissions for the content-adjacent resources (`blog:write`, `coupons:write`, `contact:write`, `certificates:write`, `referrals:write`, `reviews:write` in `models/AdminUser.js`) are granted to `admin`/`super-admin` only, mirroring the legacy stack's binary "any admin" access — no new editor/viewer fine-graining was introduced for them. New `AdminUser` accounts (there is no self-registration endpoint) are provisioned via `backend/scripts/createAdminUser.js` (`npm run create-admin -- --name ... --email ... --password ... --role ...`); first login walks through TOTP setup automatically.

**Rate limiting:** Redis-backed in production (set `REDIS_URL`), in-memory fallback in dev. Configured in `config/rateLimit.js` and `config/adminRateLimits.js`. Every store's `rateLimit()` call sets `passOnStoreError: true` — a Redis outage fails *open* (the request proceeds, unlimited, for that one call) rather than 500ing the whole API. `/api/v1/admin/*` traffic is rate-limited twice, from two independent counters: the global `apiLimiter` (mounted on all of `/api` in `app.js`) and the admin-specific `adminApiLimiter` (mounted inside `routes/v1/admin/index.js`) — the effective cap is whichever of the two is hit first.

### Frontend (`frontend/src/`)

Entry: `main.jsx` → `App.jsx` (routes + context providers).

**Context provider stack** (outer to inner):
`ErrorBoundary` → `QueryProvider` (React Query v5) → `ThemeProvider` → `LangProvider` → `AuthProvider` → `AdminAuthProvider` → `BrowserRouter`

**Error reporting:** Sentry (`@sentry/react`) is initialized in `main.jsx` (`utils/sentry.js`) whenever `VITE_SENTRY_DSN` is set, and catches uncaught errors/rejections automatically — but `ErrorBoundary.jsx`'s `componentDidCatch` also explicitly calls `captureException`, because a React error boundary catching a render error is exactly what prevents that error from ever reaching Sentry's automatic global handlers.

**State management:**
- Server state: React Query v5 (`@tanstack/react-query`) — all API calls go through custom hooks in `hooks/`
- Client state: React Context (auth, theme, language)
- Forms: React Hook Form v7

**API layer** (`api/`):
- `client.js` — Axios instance barrel (re-exports from domain files)
- `http.js` — low-level HTTP utility that attaches the CSRF token header
- 15+ domain files: `authApi.js`, `courseApi.js`, `paymentApi.js`, etc.
- `quran.js` — calls the external Quran.com API (not the backend)
- `adminHttp.js` — separate axios instance for `/api/v1/admin/*` calls (`adminApi.js`, the admin parts of `paymentApi.js`); on a 401 it clears the cached admin profile and hard-redirects to `/admin/login`, since a stale `admin_at` cookie (15 min lifetime) means a different thing than a regular-session 401 does on `http.js`
- `adminAuthApi.js` — the admin MFA login/logout calls (`/api/v1/admin/auth/*`)

**Admin console auth (`AdminAuthContext`, `pages/AdminLogin.jsx`):** `/admin` requires two layers — the existing `ProtectedRoute adminOnly` (regular `User` with `role: 'admin'`) still gates who can see the dashboard shell/nav (`DashboardLayout` is unchanged and still keyed off the regular `AuthContext`), and `AdminSessionGate` additionally requires an `AdminUser` + TOTP-MFA session (established at `/admin/login`, itself behind `ProtectedRoute adminOnly`) before any admin data loads or mutates — closing the gap where a stolen regular-session cookie alone used to be enough to grant roles, mint accounts, or approve payments. `AdminAuthProvider` is mounted app-wide (cheap — only reads `localStorage` on mount) so the gate/login page can use it regardless of route nesting.

**Routing** (`App.jsx`): All page components are lazy-loaded with `React.lazy()` + `Suspense`. Route hierarchy uses hub pages (`/courses`, `/tools`, `/resources`, `/academy`) with nested detail routes. Old flat URLs have redirect entries. `RoutePrefetcher` (mounted in `App.jsx`) prefetches a route's chunk ahead of navigation — on link visibility (idle-scheduled `IntersectionObserver`) or on `touchstart`/`pointerdown` — using the path→import map in `routePreloadMap.js`; this closes the serial "entry bundle finishes → then route chunk starts" gap that mobile field testing showed adding 700ms-1.5s+ per navigation on slow connections.

**i18n:** Custom `LangContext` supports 6 languages (en/ar/it/es/de/fr). Strings live in `i18n/` files. Arabic font (Amiri) is lazy-loaded on idle (`utils/loadArabicFonts.js`) to avoid blocking initial render — except on Arabic-text-heavy pages (`Quran.jsx`, `Teachers.jsx`), which call `loadArabicFontsNow()` immediately on mount instead of waiting for idle, since the fallback→Amiri font swap was measured as a real source of layout shift (CLS) on those pages under throttled mobile networks.

**CSS:** `styles.css` is the global index (`styles/tokens.css`, `global.css`, `layout.css`, `auth.css`, `pages.css`, `components.css`, `design-system.css`, `dark.css`, `responsive.css`). Anything only needed by specific pages is code-split — imported directly by the page/component that needs it, not added to the global index — including `quran.css`/`khatm.css`/`tasbeeh.css`/`islamic-tools.css`/`adhkar.css`/`dashboard.css` and, as of the mobile performance pass, `hifz.css` (→ `Quran.jsx` + `HifzReviewPage.jsx`) and `trust-engage.css` (→ `Home.jsx` + `Dashboard.jsx`). Coverage-API field testing showed 90-96% of the global CSS was unused on any given page before this split.

**Design system** (`styles/tokens.css` + `styles/design-system.css`): `tokens.css` is already a full 3-layer semantic token system (primitive palette → semantic `--color-*`/`--bg-*`/`--text-*`/`--border-*`/`--shadow-*`/`--radius-*`/`--space-*`/`--font-*`/`--transition-*`/`--z-*` tokens → `html.dark` overrides) and `components.css`/`dashboard-shell.css` already cover card, badge, avatar, form fields, skeleton, empty-state, and a full data-table + sidebar system — Frontend Redesign Sprint 1 audited this rather than rebuilding it, and found the real gap was a set of **interactive primitives with no generic, reusable version anywhere** (only mutually-inconsistent, hand-rolled, page/feature-specific ones existed — e.g. `.qtm`/`.exit-popup`/`.vcard-overlay` each reimplement their own modal panel with different padding/radius/shadow values; `AdminDashboard.jsx` hand-rolls its tab bar with inline styles). `design-system.css` adds: Modal/Dialog (`.ds-modal*`), Drawer (`.ds-drawer*`), Toast (`.ds-toast*`), Tooltip (`.ds-tooltip*`), Dropdown/Menu (`.ds-menu*`), Tabs (`.ds-tabs`/`.ds-tab`, including an underline variant), Accordion (`.ds-accordion*`), standalone Pagination (`.ds-pagination*`, distinct from the data-table-specific `.dt__pagination`), standalone Progress (`.ds-progress*`, distinct from the dashboard-specific `.ds-bar`), and motion-reveal utilities (`.ds-reveal`/`.ds-stagger`) reusing the keyframes already defined in `global.css` (`fadeIn`/`fadeUp`/`scale-in`) rather than redefining new ones. Every rule references an existing semantic token — no new hardcoded colors/spacing/radii were introduced, and dark-mode support is automatic (no `html.dark` overrides needed in this file at all). **This sprint is presentation-layer-only and additive**: nothing in `design-system.css` is consumed by any page yet (deliberately deferred — see the sprint report for the full design-debt list, most notably the duplicated `components.css` vs `dashboard-shell.css` "ds-" prefixed component systems, and the several ad hoc modal implementations that should eventually migrate onto `.ds-modal`).

**Landing page** (`pages/Home.jsx` + `components/{Hero,TrustBar,StatsBanner,Features,Steps,Tutors,IsnadChain,Courses,JoinCTA,Pricing,Testimonials,FAQ,Trial,Newsletter,TrustBadges}.jsx` + `styles/layout/home.css` + `styles/layout/redesign.css`): Frontend Redesign Sprint 2 audited this expecting a generic/template-feeling page to rebuild, and instead found it had already been through a comprehensive premium redesign pass — aurora-drift decorative orbs, a custom `BrandMedallion` illustration, a live social-proof activity ticker, floating stat/certification pills, a scroll-cue, and a full scroll-reveal system (`hooks/useScrollReveal.js` + `components/ui/Reveal.jsx`, with staggered `nth-child` delays already applied to course/teacher/pricing/feature grids) all already existed, all already using soft brand-tinted shadows rather than generic heavy ones, and site-wide `prefers-reduced-motion` support already existed as a single blanket override in `global.css` (not something this sprint needed to add). The one confirmed, genuinely missing piece — `Header.jsx`'s sticky glass nav had no shrink-on-scroll — was implemented (`scrolled` state + `.header--scrolled`, `header.css` + `dark.css`). No section was rebuilt from scratch; doing so risked regressing already-tuned, production code for no real gain, which the sprint's own rules explicitly forbid ("never introduce visual regressions," "reuse existing components").

**Architecture cleanup** (Frontend Architecture Sprint 3): a full dead-code/duplication audit (verified via grep cross-referencing every export against its usages, not assumed) found the frontend already in good shape — no dead hooks, no dead utils, no duplicate API functions, and the 6 i18n language files already in sync (line counts within 5 of each other). Two genuinely dead artifacts were removed: `components/ui/EmptyState.jsx` (illustrated empty-state component, zero imports anywhere, dating to a pre-engagement bulk commit) plus its now-orphaned `.empty-state*` CSS in `components.css`; and, inside `components/ui/Icons.jsx`, 13 individually-unused icon exports (`SunIcon`, `ChevronRightIcon`, `ChevronLeftIcon`, `MenuIcon`, `XIcon`, `UserIcon`, `DashboardIcon`, `TrashIcon`, `PlusIcon`, `CheckIcon`, `ExternalLinkIcon`, `SidebarIcon`, `WhatsAppIcon`) plus the `ICON_MAP`/`Icon` name-based lookup wrapper they only existed to support (that wrapper itself had zero consumers — every real usage imports specific named icons directly). Also consolidated a small, genuine, mechanically-verified duplication: `hooks/useEscapeKey.js` now centralizes the "call a callback when Escape is pressed while a flag is true" effect that `Header.jsx` (mobile drawer) and `QuickTrialModal.jsx` each hand-rolled separately — it reads the callback from a ref internally, so passing a fresh inline arrow function every render (the normal case) doesn't tear down and re-attach the `keydown` listener the way a naive extraction would. **Deliberately not touched**: the confirmed, larger duplication from Sprint 1 (`components.css`'s generic card/badge/skeleton/table system vs `dashboard-shell.css`'s parallel "ds-" prefixed one; 9+ ad hoc modal implementations that should eventually migrate onto Sprint 1's `.ds-modal`) — consolidating those means changing the rendered output of many live pages, and this sprint has no way to visually verify "no regression" for that (no browser/screenshot tooling available), so it's left as documented technical debt for a sprint that does.

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

**Notifications** (`models/Notification.js`, `controllers/notificationController.js`, `routes/notificationRoutes.js`, `frontend/src/components/ui/NotificationPanel.jsx`): the read-side API (list/unread-count/mark-read/mark-all-read/delete) existed for a while, but `createNotification()` was never actually called anywhere until Feature Sprint 1 — every business event below now fires it: manual-payment approve/reject (`manualPaymentController.js`), PayPal success/failure (`paymentController.js`'s `finalizePaypalOrder`), Stripe checkout + monthly renewal (`stripeController.js` — Stripe payment *failure* has no wired notification, since there is no `invoice.payment_failed` webhook case at all yet), live class scheduled/cancelled (`liveClassController.js`), certificate issued (`certificateController.js`), a message being sent (`messageController.js` — a **separate, additional** row from `Message.readAt`, which remains its own independent unread-count system for the messaging inbox badge), review approved (`reviewController.js`), and the renewal-reminder cron (`cronController.js`, guarded by the same `renewalReminderSentFor` idempotency field the email already used, so it fires the notification and the email exactly once per billing period). `createNotification({...}, { session })` accepts an optional Mongoose session so it can be created atomically alongside the payment/subscription writes it accompanies; it silently no-ops (no throw) when `recipient` is falsy, since several sources (guest checkouts, Stripe webhooks missing `userId` metadata) legitimately have nobody to notify. Enrollment approve/reject, homework, admin-announcement broadcast, and per-user coupon-grant notifications are **not wired** — the underlying business flows either don't carry a `User` `_id` to notify (`Enrollment`/`TrialRequest` are email-keyed lead forms) or don't exist as a feature at all (no `Homework` model, no announcement-broadcast admin action). The bell badge in `DashboardLayout.jsx` polls `GET /api/notifications/unread` every 30s, independently of the pre-existing `GET /api/messages/unread/count` poll that still drives the "Messages" nav item's badge — the two were previously conflated (the bell incorrectly showed the messages count).

**Reviews** (`models/Review.js`, `controllers/reviewController.js`, `routes/reviewRoutes.js`, `routes/v1/admin/reviewsRoutes.js`): `createReview`/`getTeacherReviews`/`getCourseReviews`/`moderateReview` all worked correctly before Feature Sprint 2, but had zero frontend consumers anywhere and no admin listing endpoint at all — `moderateReview` existed with no way to discover which review `_id`s needed moderating. `GET /api/reviews` (`listReviews`, optionally `?status=`) was added on the legacy `protect+adminOnly` router — the same "admin reads stay on the legacy router, only the mutation is on the hardened `/v1/admin` MFA stack" convention already used for coupons/contact/certificates — to make the moderation queue actually usable. `getTeacherReviews`/`getCourseReviews`/`moderateReview`/`createReview` also gained the same `ObjectId.isValid()` guard pattern applied elsewhere in the admin surface (malformed ids previously threw an unhandled CastError → 500 instead of a clean 400). Frontend: `Dashboard.jsx`'s existing "My Tutor" card (real assigned teacher via `user.teacher`, a genuine `User._id` — **not** `enrollment.teacherName`, which is only a free-text label from the public lead-capture `Enrollment` form) now has a real `TutorReviewWidget` showing the live approved-review average/count and a submit-review form with a pending-approval state; `AdminDashboard.jsx` gained a "Reviews" tab (`AdminReviewsTab.jsx`) for the approve/reject moderation queue. The public marketing teacher directory (`pages/TeacherProfile.jsx`, `pages/Teachers.jsx`, `data/teachers.js`) is **not** wired to this system — it's 100% static editorial content (fictional numeric ids, hardcoded bios/ratings) with no corresponding real `User` account, so there is no real teacher/review data to connect it to without inventing a new public-teacher-directory feature; the only change there was removing a fake `localStorage`-based "rate this teacher" widget that recomputed a client-only average no one else ever saw, replaced with an honest static display of the same editorial numbers. **Course reviews**: `getCourseReviews` originally returned only `reviews/total/page/pages` (no average or distribution, unlike `getTeacherReviews`) — extended with a new `Review.ratingStatsForCourse` static (separate from `avgRatingForTeacher`, to avoid touching the already-shipped teacher-review path) so the response also carries `avg`/`count`/`distribution` (a `{1..5: count}` breakdown across ALL approved reviews for the course, not just the current page). `components/features/courses/CourseReviews.jsx` consumes this on `CourseContent.jsx` (the real, `ProtectedRoute`-gated course detail page — not the static marketing course hubs) with a submit-review form, pending-approval/already-reviewed states, and "Load more" pagination. There is no edit/delete-own-review endpoint on the backend (only create + admin moderate), so the UI intentionally doesn't offer those actions.

**Wishlist** (`models/Wishlist.js`, `controllers/wishlistController.js`, `routes/wishlistRoutes.js`, `frontend/src/hooks/useWishlist.js`): the full CRUD API and React Query hook (`useWishlist`/`useAddToWishlist`/`useRemoveFromWishlist`/`useClearWishlist`/`useIsWishlisted`) already existed — including a partial (read-only) frontend test file — but, like Notifications/Reviews before Feature Sprints 1–2, had zero real UI consumers anywhere in the app until Feature Sprint 3. Investigation also found a genuine defect in `addToWishlist`: a plain `$addToSet` does **not** dedupe here, because each embedded `courses` subdocument also carries an `addedAt` field (schema default `Date.now`) that Mongoose re-casts fresh on every request — MongoDB's `$addToSet` compares the whole embedded document, so two adds of the same course a moment apart were never equal and both got pushed, silently defeating the "set" semantics the operator is named for (verified empirically before and after the fix). Fixed with an explicit ensure-document-exists-then-conditional-`$push` pattern instead of relying on `$addToSet`. `addToWishlist`/`removeFromWishlist` also gained the same `ObjectId.isValid()` guard used elsewhere, and `addToWishlist` now 404s for a well-formed id that isn't a real `Course`. Frontend: a reusable `WishlistButton.jsx` heart-toggle is wired into `Dashboard.jsx`'s real course cards (`user`'s actual enrolled/available courses, not the static marketing catalog), and a new dedicated `pages/Wishlist.jsx` (`/wishlist`, `ProtectedRoute`, linked from the student sidebar nav) lists saved courses with remove/clear-all and loading/error/empty states.

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

No Docker. Deployments themselves are platform-triggered (Vercel/Render), but `.github/workflows/ci.yml` runs backend + frontend tests, lint, and build on push/PR (two parallel jobs; does not deploy anything).

## Key environment variables

Backend (see `backend/.env.example`):
- `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `ADMIN_JWT_ACCESS_SECRET` (64-byte hex), `ADMIN_ENCRYPTION_KEY` (64-char hex, for TOTP secrets)
- `CLIENT_URL` — must match the frontend origin for CORS
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
- `SMTP_HOST/PORT/USER/PASS/ADMIN_EMAIL`
- `ADMIN_IP_WHITELIST` — comma-separated IPs/CIDR allowed to hit admin routes. If unset: allows all IPs in development/test, but **fails closed (denies all admin requests)** when `NODE_ENV=production` (`backend/middleware/ipWhitelist.js`) — confirm this var is actually set on Render before deploying, or admin access will be locked out
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
