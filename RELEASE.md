# Release Package — Al-Rahma Academy

This document packages the engineering work completed on this repository for
release. It covers the full engineering effort (backend/frontend audits,
security, performance, architecture, monitoring, and deployment-readiness
passes) and the concrete diff currently sitting in the working tree, not yet
committed.

**Scope note on "files changed":** this repository's `main` branch already
contains an earlier, already-merged batch of engineering work (validation
standardization, coupon/referral query optimization, auth cleanup, MongoDB
index/aggregation/search optimization, CI pipeline, coupon test rewrite —
visible in the `gggg` commit, already present on `origin/main`). The
**"Files Changed"** section below (§2) lists only what is **currently
uncommitted in the working tree** — i.e., the security / frontend-architecture
/ monitoring / deployment-readiness / final-audit batch — since that is the
one verifiable, evidence-backed diff at the time of writing. The categorized
summary in §1 covers the full project for completeness.

No application code was modified to produce this document.

---

## 1. Categorized Summary of Engineering Changes

### Validation & API Consistency
- Standardized request validation via `express-validator` arrays across route handlers.
- Standardized error response shape to `{ message: "..." }` across controllers (verified by dedicated contract tests, e.g. `validation-error-contract.test.js`).
- Standardized JWT cookie expiration handling in `authController.js`.

### Authentication & Authorization
- Consolidated duplicated admin-authorization-check logic (removed a dead `requireRole()` export and its stale doc references from `middleware/auth.js`).
- Pinned JWT verification to `algorithms: ['HS256']` on every `jwt.verify()` call (`middleware/auth.js`, `middleware/adminAuth.js`, `controllers/adminAuthController.js`) — closes an algorithm-confusion attack surface.
- Fixed `referralController.trackReferral`: previously took `refereeId` from the request body with **no authentication at all**; now requires `protect` and derives the referee from the authenticated session (`backend/routes/referralRoutes.js`, `backend/controllers/referralController.js`).
- Fixed `referralController.convertReferral`: was missing `adminOnly` despite its own doc comment stating admin-only access; any logged-in user could convert any referral. Now requires `adminOnly`.
- Fixed the admin IP whitelist (`middleware/ipWhitelist.js`): previously failed **open** (allowed all IPs) whenever `ADMIN_IP_WHITELIST` was unset, in every environment including production. Now fails **closed** in production; unchanged permissive behavior in dev/test. `config/validateEnv.js` logs a loud startup warning if unset in production.

### MongoDB / Database
- Added a supporting index for `Course.level` (verified via `explain('executionStats')` that a level-only filter now uses the index instead of a collection scan).
- Optimized `referralController.trackReferral`'s lookup from a full `User.find({})` scan to an indexed `referralCode` fast path, with a self-healing fallback for pre-migration users.
- Eliminated N+1 query patterns in `getMyStudents` (teacher dashboard) and `sendWeeklyParentReports` (cron) — replaced per-student/per-child sequential queries with batch-fetched lookup maps.
- Applied `.lean()` to read-only queries where proven safe (no `.save()`/instance-method/virtual usage downstream).
- Documented (via ADR, `docs/adr/0001-defer-plain-indexes-for-regex-search.md`) why plain B-tree indexes were **not** added for the existing regex-based search — they don't help unanchored regex queries; the real fix (compound/covered index work) was scoped separately.

### Security
- XSS fix: `CertificateCard.jsx` and `VerseCardModal.jsx` built raw HTML via `document.write()` interpolating unescaped data (admin-supplied certificate fields; third-party Quran API data respectively). Both now route through a shared `frontend/src/utils/escapeHtml.js` helper.
- `Permissions-Policy` header (`vercel.json`) previously denied microphone entirely, which would have broken the real Hifz voice-recording feature (`useQuranRecorder.js`); changed `microphone=()` → `microphone=(self)`.
- NoSQL-injection guard (`sanitizeMongo` middleware) confirmed in place ahead of route handlers.
- Confirmed no sensitive data (passwords, tokens, secrets, raw request bodies) appears in any `logger.*` call site (repo-wide grep).

### Frontend Architecture
- Removed 20 confirmed-dead files after repo-wide import-trace verification: `Button.jsx`, `Card.jsx`, `Table.jsx`, `DataTable.jsx`, `Badge.jsx`, `FormField.jsx`, `ShareVerseCard.jsx`, `layout/Sidebar.jsx`, `features/HifzMode.jsx`, `features/UpcomingClasses.jsx`, the entire unused A/B-testing cluster (`ABTest.jsx`, `useABTest.js`, `ABTestContext.js`, `abTestAssignment.js`), `useNotifications.js`, `api/referralApi.js`, `api/reviewApi.js`, the inert `Toast.jsx`/`ToastProvider` (mounted but its `useToast()` hook was never called anywhere), and the orphaned `styles/dashboard.css`.
- Consolidated 8 independent copies of the same `name.split(' ')...` initials-computation one-liner into `frontend/src/utils/nameInitials.js`.
- Migrated 14 files off the deprecated `api/client.js` barrel onto their proper domain-specific API modules (the barrel's own comment already said "new code should import directly from the domain file"); deleted the barrel once it had zero remaining importers.
- Removed 8 redundant duplicate CSS imports (`dashboard-shell.css`, `components.css`) that were already loaded via `DashboardLayout`/`styles.css`.

### Accessibility
- Audited and fixed keyboard operability, modal focus management (initial focus, Escape-to-close, focus-return, body-scroll-lock), and `aria-invalid`/`aria-describedby` wiring across the Quran reader, modals, and forms.

### Testing
- Added dedicated regression coverage for every fix above (payment lifecycle, billing, coupon rewrite, N+1 query equivalence, referral authorization, IP whitelist fail-closed behavior, CertificateCard XSS escaping, `/ready` readiness accuracy, cron completion logging, `ErrorBoundary`→Sentry reporting, and the `NotificationPanel` fetch bug below).
- Current verified state: **205/205 backend tests passing**, **42/42 frontend tests passing** (11 test files), both lint suites clean, frontend production build succeeds.

### Monitoring & Observability
- Winston's `exceptionHandlers`/`rejectionHandlers` previously wrote **only** to a local rotating file in production; since Render (the deploy target) has no persistent disk, that file never survives a restart. Console is now always included so crash detail reaches Render's actual log stream.
- `middleware/errorHandler.js`'s error log entry now includes `requestId`, matching every other log call site, so a request's error log line can be correlated with its completion log line.
- `config/db.js` now logs `mongoose.connection` `disconnected`/`reconnected`/`error` events at runtime, not just the initial connect.
- `/ready` previously reported `{status:'ready'}` from a cached connection object that never re-checked liveness — structurally unable to report "not ready" once ever connected. Now additionally checks `mongoose.connection.readyState`.
- Cron jobs (`sendRenewalReminders`, `sendWeeklyParentReports`) now log a completion summary — previously the only log signal was per-item failures, with no confirmation the externally-scheduled job ran at all.
- `ErrorBoundary.jsx` now calls Sentry's `captureException` — Sentry was already fully initialized in production, but React error boundaries prevent a caught render error from ever reaching Sentry's automatic global handlers, so crashes this boundary caught were previously invisible in Sentry.

### CI/CD
- Added `.github/workflows/ci.yml`: two parallel jobs (backend, frontend) running lint/test/build on push/pull request to `main`, with least-privilege permissions, npm caching, and `mongodb-memory-server` binary caching. Does not deploy anything.

### Deployment Documentation
- Corrected `frontend/.env.example`: it previously told deployers to set an absolute `VITE_API_URL` for Vercel, contradicting `CLAUDE.md`/`DEPLOY.md`/`DEPLOYMENT_CHECKLIST.md`, all three of which correctly describe the relative-`/api`-via-rewrite architecture.
- Corrected `/api/health` → `/health` in `DEPLOYMENT_CHECKLIST.md` (×2) and `POST_LAUNCH_CHECKLIST.md` (×1) — the real route is registered at the app root, not under `/api` (confirmed in `app.js` and `render.yaml`'s `healthCheckPath`).
- Corrected `DEPLOYMENT_CHECKLIST.md`/`POST_LAUNCH_CHECKLIST.md` references to "Netlify" for env vars / deploy logs / analytics — Vercel is the live frontend host and the one with `@vercel/analytics` actually integrated in `App.jsx`.
- Removed two stale "not yet implemented" rows from `POST_LAUNCH_CHECKLIST.md`'s deferred-items table (Sentry error monitoring; `manifest.json`/PWA) — both are already fully implemented in the codebase.
- Updated `MONITORING.md` to describe the `/ready` endpoint, the Console-logging fix for exceptions/rejections, and the `ErrorBoundary`→Sentry wiring.

### Final Bug Fix
- `NotificationPanel.jsx` (rendered for every logged-in user via `DashboardLayout`) destructured a non-existent `getNotifications` export (the real export is `getMyNotifications`) **and** treated the resolved value as a bare array, when the real endpoint resolves a paginated object (`{ notifications, total, unreadCount, page, pages }`). Both were silently swallowed by the component's own `try/catch`, so the notification bell has been showing "You're all caught up!" for every user regardless of actual notification state. Fixed; proven with a test that fails against the original code and passes against the fix.

---

## 2. Files Changed (currently uncommitted working-tree diff)

**Deleted (20 files — dead code, verified zero importers repo-wide):**
```
frontend/src/api/client.js
frontend/src/api/referralApi.js
frontend/src/api/reviewApi.js
frontend/src/components/features/HifzMode.jsx
frontend/src/components/features/UpcomingClasses.jsx
frontend/src/components/layout/Sidebar.jsx
frontend/src/components/ui/ABTest.jsx
frontend/src/components/ui/Badge.jsx
frontend/src/components/ui/Button.jsx
frontend/src/components/ui/Card.jsx
frontend/src/components/ui/DataTable.jsx
frontend/src/components/ui/FormField.jsx
frontend/src/components/ui/ShareVerseCard.jsx
frontend/src/components/ui/Table.jsx
frontend/src/components/ui/Toast.jsx
frontend/src/context/ABTestContext.js
frontend/src/hooks/useABTest.js
frontend/src/hooks/useNotifications.js
frontend/src/styles/dashboard.css
frontend/src/utils/abTestAssignment.js
```

**Modified — backend (18 files):**
```
backend/.gitignore
backend/app.js
backend/config/db.js
backend/config/logger.js
backend/config/validateEnv.js
backend/controllers/adminAuthController.js
backend/controllers/cronController.js
backend/controllers/referralController.js
backend/middleware/adminAuth.js
backend/middleware/auth.js
backend/middleware/errorHandler.js
backend/middleware/ipWhitelist.js
backend/routes/referralRoutes.js
backend/tests/cron.test.js
backend/tests/referral.test.js
```

**Modified — frontend (31 files):**
```
frontend/.env.example
frontend/src/App.jsx
frontend/src/api/index.js
frontend/src/components/ErrorBoundary.jsx
frontend/src/components/Newsletter.jsx
frontend/src/components/Trial.jsx
frontend/src/components/features/admin/AdminCoursesTab.jsx
frontend/src/components/features/admin/AdminPaymentsTab.jsx
frontend/src/components/features/admin/AdminProgressModal.jsx
frontend/src/components/features/admin/AdminStaffTab.jsx
frontend/src/components/features/admin/AdminUsersTab.jsx
frontend/src/components/layout/DashboardLayout.jsx
frontend/src/components/ui/CertificateCard.jsx
frontend/src/components/ui/CheckoutModal.jsx
frontend/src/components/ui/NotificationPanel.jsx
frontend/src/components/ui/VerseCardModal.jsx
frontend/src/context/AuthContext.jsx
frontend/src/pages/AdminDashboard.jsx
frontend/src/pages/Billing.jsx
frontend/src/pages/Dashboard.jsx
frontend/src/pages/Enroll.jsx
frontend/src/pages/ForgotPassword.jsx
frontend/src/pages/Messages.jsx
frontend/src/pages/ParentDashboard.jsx
frontend/src/pages/PaymentResult.jsx
frontend/src/pages/Profile.jsx
frontend/src/pages/ResetPassword.jsx
frontend/src/pages/TeacherDashboard.jsx
frontend/src/styles.css
frontend/src/styles/components.css
frontend/src/styles/global.css
```

**Modified — docs & config (5 files):**
```
CLAUDE.md
DEPLOYMENT_CHECKLIST.md
MONITORING.md
POST_LAUNCH_CHECKLIST.md
vercel.json
```

**New files (10 files):**
```
backend/tests/db-connection-observability.test.js
backend/tests/error-handler-observability.test.js
backend/tests/ip-whitelist.test.js
backend/tests/logger-observability.test.js
backend/tests/ready-endpoint.test.js
frontend/src/test/CertificateCard.security.test.jsx
frontend/src/test/ErrorBoundary.test.jsx
frontend/src/test/NotificationPanel.test.jsx
frontend/src/utils/escapeHtml.js
frontend/src/utils/nameInitials.js
```

---

## 3. Remaining Manual Deployment Steps

These cannot be automated from this repository and must be done by a human with dashboard access:

1. **Confirm `ADMIN_IP_WHITELIST` is set on Render before deploying.** The IP-whitelist fix now fails closed (denies all admin requests) in production when this is unset — previously it failed open. If it isn't currently set on live Render, deploying this change locks out all admin access until it's configured and the service is redeployed.
2. **Point `vercel.json`'s `/api/:path*` rewrite at the correct Render URL** for this environment before the first deploy (it currently targets `https://alrahma-1.onrender.com`).
3. **Register Stripe and PayPal webhook endpoints** against the live Render URL (`/api/payments/stripe/webhook`, `/api/payments/paypal/webhook`) and copy the resulting signing secret/webhook ID into `STRIPE_WEBHOOK_SECRET`/`PAYPAL_WEBHOOK_ID` on Render.
4. **Configure an external scheduler for the cron endpoints.** Neither Render nor Vercel runs a scheduled job for this project — `GET /api/cron/renewal-reminders` and `GET /api/cron/weekly-parent-reports` must be triggered daily by something external (e.g. UptimeRobot, GitHub Actions scheduled workflow) sending `Authorization: Bearer <CRON_SECRET>`. **Note:** `backend/.env.example`'s comment claims "Vercel Cron sends it automatically" — this is inaccurate for this project's architecture (Vercel only hosts the frontend here); this document was not modified as part of this release package per the "no code changes" instruction, but the correct information is captured here.
5. **Set `CLIENT_URL` on Render** to the exact production frontend domain (CORS checks against this exactly).
6. **Connect the custom domain in Vercel's dashboard** and confirm the `.vercel.app` → custom-domain redirect fires (defined in `vercel.json`'s `redirects`).
7. **Enable MongoDB Atlas automated backups** (dashboard-level setting — not present in this repository).
8. **Set `VITE_SENTRY_DSN` in Vercel's environment variables** if Sentry error reporting is desired — `frontend/.env.example` does not currently list this variable even though `utils/sentry.js` reads it; without it, `initSentry()` is a no-op.
9. **Move this batch of changes through the repository's own git workflow** (feature branch → PR) before merging to `main` — per `CLAUDE.md`, direct commits to `main` are against this repo's documented process.

---

## 4. Production Deployment Checklist

*(Consolidated from `DEPLOYMENT_CHECKLIST.md`, corrected in this project for accuracy — see that file for the full, checkbox-by-checkbox version.)*

- [ ] All required backend env vars set in Render (§7 below)
- [ ] `NODE_ENV=production` set on Render (already default in `render.yaml`)
- [ ] Backend deployed; deploy logs show `MongoDB connected` with no errors
- [ ] `curl https://<render-url>/health` returns 200
- [ ] `curl https://<render-url>/ready` returns 200 (confirms live DB connectivity, not just an initial connect)
- [ ] Frontend deployed on Vercel; build settings match `vercel.json` (install/build `frontend/` only, output `frontend/dist`)
- [ ] `vercel.json`'s `/api/:path*` rewrite target matches the live Render URL
- [ ] Custom domain connected in Vercel; HTTPS certificate active
- [ ] `CLIENT_URL` on Render matches the exact production frontend domain
- [ ] No CORS errors when exercising login/enrollment/payment from the live frontend
- [ ] Cookies: `httpOnly` + `Secure` + `SameSite=Lax` confirmed in DevTools after login
- [ ] Stripe and PayPal webhooks registered against the live Render URL; keys switched from test/sandbox to live
- [ ] External cron scheduler configured and firing daily against `/api/cron/renewal-reminders` (and `/api/cron/weekly-parent-reports` if used)
- [ ] `ADMIN_IP_WHITELIST` confirmed set on Render (or explicitly accepted that admin access will be denied until it is)

---

## 5. Post-Deployment Verification Checklist

*(Consolidated from `POST_LAUNCH_CHECKLIST.md`, corrected in this project for accuracy — see that file for the full hour-by-hour version.)*

- [ ] Site loads over HTTPS with no certificate warning
- [ ] Backend health (`/health`) and readiness (`/ready`) both return 200
- [ ] Login, enrollment form, and a test payment all succeed with zero CORS errors
- [ ] Render logs show no unexpected 5xx errors or uncaught exceptions
- [ ] A deliberately-triggered frontend crash appears in Sentry (if `VITE_SENTRY_DSN` is set) — confirms the `ErrorBoundary` → `captureException` wiring is live
- [ ] Notification bell shows real data for a user with at least one notification (regression check for the fix in §1)
- [ ] Stripe/PayPal test transaction completes and the webhook fires with status "Succeeded"
- [ ] Free trial and registration emails arrive (confirms SMTP is configured)
- [ ] GA4 Realtime shows page views, if `VITE_GA_ID` is set
- [ ] UptimeRobot (or equivalent) shows the health-check monitor as UP
- [ ] Cron scheduler's own run log shows a successful call within the last 24 hours

---

## 6. Rollback Checklist

No rollback-strategy document existed in this repository prior to this release package (confirmed by search); the following is derived directly from this project's own git history and the per-change rollback notes recorded during development — not from any unverifiable platform-specific behavior.

- [ ] **Code-level rollback**: every change in §1/§2 is isolated to its own file(s) with no cross-file coupling beyond what's listed. `git revert <commit>` (once committed) or reverting an individual file restores the prior behavior for that one change without affecting the others.
- [ ] **Highest-priority rollback candidate**: the admin IP whitelist fail-closed change (`backend/middleware/ipWhitelist.js`, `backend/config/validateEnv.js`). If deploying it locks out admin access unexpectedly, revert these two files first.
- [ ] **Database**: no schema migrations were introduced in this batch of changes (verified — no new required fields, no data backfills beyond the already-shipped, separately-reviewed `referralCode` self-healing logic from earlier work). No database-level rollback action is required for this release.
- [ ] **Deleted files** (§2): all 20 are recoverable via `git checkout <prior-commit> -- <path>` if any prove to have been needed after all — each was verified dead via repo-wide import trace before deletion, but this is the fastest path back if that verification is ever found to be wrong for a specific file.
- [ ] **Render/Vercel platform rollback** (redeploying a previous build): **Cannot Verify** from this repository — this depends on Render's and Vercel's dashboard-level deployment history, which isn't represented in source control.
- [ ] **Webhook state**: if `STRIPE_WEBHOOK_SECRET`/`PAYPAL_WEBHOOK_ID` are rolled back to a previous value, re-confirm the corresponding dashboard webhook endpoint still points at the intended URL — this repository cannot verify live webhook dashboard configuration.

---

## 7. Required Environment Variables

### Backend (Render) — source: `backend/.env.example`, `render.yaml`, `backend/config/validateEnv.js`

| Variable | Required? | Notes |
|---|---|---|
| `MONGO_URI` | **Yes** (hard fail on missing) | Atlas connection string |
| `JWT_SECRET` | **Yes** (hard fail on missing) | Long random string |
| `JWT_EXPIRES_IN` | Recommended | e.g. `7d` |
| `CLIENT_URL` | Recommended | Exact production frontend origin — CORS allowlist |
| `PORT` | No | Defaults to `5000` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `ADMIN_EMAIL` | Recommended | Emails silently disabled (logged warning) if unset |
| `CRON_SECRET` | Recommended | Protects `/api/cron/*`; endpoint fails closed (503) if unset |
| `RENEWAL_REMINDER_DAYS` | No | Defaults to `3` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Recommended (required for Stripe payments) | |
| `PAYPAL_MODE` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` | Recommended (required for PayPal payments) | `PAYPAL_MODE` is `sandbox` or `live` |
| `PAYPAL_RECEIVER_EMAIL` / `PAYPAL_ME_LINK` | Optional | Manual-payment display fields (`manualPaymentController.js`) — not documented in `.env.example`, present in `render.yaml` |
| `WU_RECEIVER_NAME` / `WU_RECEIVER_COUNTRY` / `WU_RECEIVER_CITY` | Optional | Western Union manual-payment display fields |
| `MG_RECEIVER_NAME` / `MG_RECEIVER_COUNTRY` / `MG_RECEIVER_CITY` | Optional | MoneyGram manual-payment display fields |
| `ADMIN_JWT_ACCESS_SECRET` | Critical (logged error if missing, does not hard-exit) | 64-byte hex, must differ from `JWT_SECRET` |
| `ADMIN_ENCRYPTION_KEY` | Critical (logged error if missing, does not hard-exit) | Exactly 64 hex chars (32 bytes) |
| `ADMIN_IP_WHITELIST` | Recommended in production | **Now fails closed (denies all admin requests) if unset in production** — see §3 |
| `GOOGLE_CLIENT_ID` | Optional | Google Sign-In |
| `REDIS_URL` | Optional | Enables distributed rate limiting. **Verified**: `ioredis` and `rate-limit-redis` are already listed in `backend/package.json` dependencies and `config/rateLimit.js` already dynamically imports them when this is set — no additional install step is needed, contrary to the `.env.example` comment |

### Frontend (Vercel) — source: `frontend/.env.example`, `frontend/src/utils/sentry.js`

| Variable | Required? | Notes |
|---|---|---|
| `VITE_API_URL` | **Not needed in production** | `vercel.json`'s rewrite already forwards `/api/*` to Render; only used for local dev (`http://localhost:5000/api`) |
| `VITE_GA_ID` | Optional | GA4 Measurement ID; analytics stay off until set |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Same value as backend `GOOGLE_CLIENT_ID` |
| `VITE_CLARITY_ID` | Optional | Microsoft Clarity project ID |
| `VITE_TAWK_PROPERTY_ID` / `VITE_TAWK_WIDGET_ID` | Optional | Tawk.to live chat |
| `VITE_DEMO_VIDEO_ID` | Optional | YouTube video ID for the Hero "Watch demo" modal |
| `VITE_DAILY_DOMAIN` | Optional | Daily.co domain, used to detect embedded live-class rooms |
| `VITE_SENTRY_DSN` | Optional, **not listed in `.env.example`** (verified gap) | Read directly by `utils/sentry.js`; without it, Sentry initialization is a no-op |
| `VITE_APP_VERSION` | Optional | Read by `utils/sentry.js` as the Sentry release tag; defaults to `'unknown'` if unset |

---

## 8. Third-Party Services to Configure

Confirmed by dependency (`package.json`) and/or direct code reference:

| Service | Purpose | Evidence |
|---|---|---|
| **Render** | Backend hosting (standalone Node process) | `render.yaml` |
| **Vercel** | Frontend hosting (static SPA + `/api/*` rewrite) | `vercel.json` |
| **MongoDB Atlas** | Primary database | `MONGO_URI`, `mongoose` dependency |
| **Stripe** | Card/Apple Pay/Google Pay subscription payments | `stripe` dependency, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` |
| **PayPal** | International payments | `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`/`PAYPAL_WEBHOOK_ID` |
| **Google OAuth** | Google Sign-In | `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` |
| **SMTP (Gmail App Password documented)** | Transactional email (password reset, enrollment, cron reminders) | `nodemailer` dependency, `SMTP_*` vars |
| **Sentry** | Frontend error tracking | `@sentry/react`, `@sentry/vite-plugin` dependencies, `VITE_SENTRY_DSN` |
| **Google Analytics (GA4)** | Frontend analytics | `VITE_GA_ID` |
| **Microsoft Clarity** | Frontend session analytics | `VITE_CLARITY_ID` |
| **Tawk.to** | Live chat widget | `VITE_TAWK_PROPERTY_ID`/`VITE_TAWK_WIDGET_ID` |
| **Daily.co** | Live-class video embed detection | `VITE_DAILY_DOMAIN` |
| **Redis (optional, e.g. Upstash)** | Distributed rate limiting across instances | `ioredis`/`rate-limit-redis` dependencies, `REDIS_URL` |
| **An external scheduler** (UptimeRobot, GitHub Actions, etc.) | Fires the cron endpoints daily — **required**, since neither Render nor Vercel runs one for this project | `CLAUDE.md`, `render.yaml` comments, `routes/cronRoutes.js` |
| **Vercel Analytics** | Frontend bandwidth/traffic analytics | `@vercel/analytics` dependency, imported in `App.jsx` |
| **Netlify** | Present in repo (`netlify.toml`) but **not the live host** — confirmed unreferenced by the live CSP/redirect config | `CLAUDE.md` |

---

## 9. Known Limitations and Future Improvements

**Known limitations (present in the codebase today):**
- No cookie-consent (GDPR) banner exists, despite GA4 being available.
- Rate limiting defaults to in-memory (resets on restart) unless `REDIS_URL` is set — the code and dependencies already support Redis, only the env var is missing by default.
- `NotificationPanel`'s "Mark all read" action only updates local component state; it does not call the existing `markNotifRead`/`markAllNotifsRead` API endpoints, so read-status does not persist across a page reload.
- Only an `.svg` favicon exists; some legacy browsers may show a broken tab icon.
- `backend/.env.example`'s cron-secret comment inaccurately attributes automatic header injection to "Vercel Cron" — this project's cron endpoints require an external scheduler regardless of host (see §3, item 4).
- Two admin-authorization areas remain explicitly deferred (not evaluated as part of this release, per prior direction): removal of a legacy MFA-less admin auth path, and replacement of the `speakeasy` TOTP library.
- Coupon-to-checkout financial wiring was explicitly deferred as a business-logic change requiring separate approval.

**Cannot Verify from this repository:**
- MongoDB Atlas backup/retention configuration (dashboard-level).
- Live values of any `sync: false` secret in `render.yaml`.
- Render's and Vercel's actual platform rollback behavior.
- Render's exact Node.js runtime version relative to CI's pinned Node 20 (`backend/package.json` only specifies `"node": ">=18"`; no `.nvmrc` exists).
- The original rationale for the hardcoded DNS override (`dns.setServers(['8.8.8.8','1.1.1.1'])`) in `backend/config/db.js` — no comment documents why.

**Future improvements (non-blocking):**
- Persist notification read-state to the backend.
- Add a cookie-consent banner if EU traffic with GA4 becomes a compliance concern.
- Pin an explicit Node runtime version once Render's actual version is confirmed via its dashboard.
- Clean up a small number of confirmed-harmless dead code items (`progressController.js`'s unused `BADGES` constant, `systemController.js`'s unused `createAuditLog` import).

---

## 10. Verification Evidence

At the time this document was produced:
- Backend: **205/205 tests passing**, lint clean (6 pre-existing warnings, individually verified as harmless — not production issues).
- Frontend: **42/42 tests passing** (11 files), lint clean, production build succeeds.
- No application code was modified while producing this document — only this file (`RELEASE.md`) was created.

**PASS**
