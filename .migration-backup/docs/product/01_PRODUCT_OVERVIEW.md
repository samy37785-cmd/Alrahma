# 01 — Product Overview

> Complete description of the Al-Rahma Academy platform: business goals, target users, main modules, and overall architecture. Every claim is grounded in source; items that could not be confirmed from code are flagged **[needs verification]**.

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md). Companion engineering docs: [../ARCHITECTURE.md](../ARCHITECTURE.md), [../API.md](../API.md), [../../CLAUDE.md](../../CLAUDE.md).

---

## 1. What the product is

**Al-Rahma Academy** is a full-stack, multi-language **online Islamic education platform**. It sells and delivers structured tuition (Quran & Tajweed, Hifz/memorization, Ijazah, Arabic, Islamic Studies) to students worldwide, coordinates live one-to-one classes, and gives parents oversight of their children's progress. Around the paid academy sits a large free "top of funnel" surface of Islamic tools and content (Quran reader, adhkar, hadith, prayer times, qibla, calendar) that drives acquisition.

The application is a **monorepo**:

| Part | Path | Tech | Deployed as |
|---|---|---|---|
| Frontend | [frontend/](../../frontend/) | React 18 SPA, Vite, React Router 6, React Query 5, React Hook Form | Static build on **Vercel**; `/api/*` rewritten to Render ([vercel.json](../../vercel.json)) |
| Backend | [backend/](../../backend/) | Express 4, Mongoose, Winston | Standalone long-running `node server.js` on **Render** ([render.yaml](../../render.yaml)) |
| Database | — | MongoDB Atlas | Managed |
| Scheduler | [.github/workflows/cron.yml](../../.github/workflows/cron.yml) | GitHub Actions | Hits `/api/cron/*` with `CRON_SECRET` |

There is **no serverless API wrapper** — the backend is a single persistent Express process. Neither Vercel nor Render run cron; scheduling is external via GitHub Actions.

---

## 2. Business goals

Inferred from the feature set, pricing config, and marketing surfaces (all code-grounded):

1. **Sell subscriptions to online Islamic tuition.** Pricing is server-authoritative in [backend/config/plans.js](../../backend/config/plans.js): three EUR plans — **Starter €56, Standard €84, Premium €112**, each shown at 25% off. Subscriptions are 30-day (one-time) or recurring (Stripe).
2. **Convert free tool users into paying students.** A wide free surface (Quran reader, prayer tools, blog, FAQ) plus lead-capture funnels: free-trial requests ([Trial.jsx](../../frontend/src/components/features/marketing/Trial.jsx), `POST /api/trials`), enrollment wizard ([Enroll.jsx](../../frontend/src/pages/Enroll.jsx)), newsletter, exit-intent popup, live chat/WhatsApp.
3. **Deliver and track learning.** Course content gated behind an active subscription; per-lesson progress; Quran memorization (Hifz) tracking; certificates (Ijazah/completion/hifz/attendance).
4. **Coordinate humans.** Live one-to-one classes, teacher↔student messaging, teacher student-records, parent oversight of children.
5. **Retain & grow.** Gamification (XP/level/streak/badges on `User`), referrals (reward days for both parties), renewal-reminder and weekly-parent-report emails via cron, reviews and community feed for social proof.
6. **Operate safely at admin scale.** A hardened admin console with RBAC, TOTP MFA, IP whitelisting, immutable audit log, and financial/maintenance kill-switches.

> **[needs verification]** Exact commercial targets, conversion metrics, and go-to-market are not in the codebase; the goals above are inferred from implemented features.

---

## 3. Target users

Five distinct audiences, mapped to the two identity systems (see [03_USER_ROLES.md](03_USER_ROLES.md)):

| Audience | Identity | Where they live in the product |
|---|---|---|
| **Prospective students / visitors** | none (public) | Marketing pages, free tools, blog/FAQ, trial + enrollment funnels |
| **Students** | `User.role = student` | `/dashboard`, course content, Quran reader, AI tutor, billing, community, messages |
| **Teachers (tutors)** | `User.role = teacher` | `/teacher`, student records, live classes, messaging |
| **Parents** | `User.role = parent` | `/parent`, linked-children progress, weekly email reports |
| **Staff / operators** | `AdminUser` (separate system, TOTP MFA + RBAC) | `/admin` console tabs |

Note the deliberate separation: the public **teacher directory** ([Teachers.jsx](../../frontend/src/pages/Teachers.jsx), [data/marketing/teachers.js](../../frontend/src/data/marketing/teachers.js)) is **static editorial content with no real accounts**, distinct from real `role: teacher` User accounts. In English UI the teaching role is called **tutor**.

---

## 4. Main modules

Grouped functional modules (full detail in [07_FEATURE_INVENTORY.md](07_FEATURE_INVENTORY.md)):

| Module | Status | Backend anchor | Frontend anchor |
|---|---|---|---|
| **Auth & accounts** (student/teacher/parent) | Complete | `authController.js`, `models/User.js` | `Login/Register/ForgotPassword/ResetPassword`, `AuthContext` |
| **Admin auth** (TOTP MFA, RBAC, session rotation) | Complete | `adminAuthController.js`, `models/AdminUser.js` | `AdminLogin`, `AdminAuthContext`, `AdminSessionGate` |
| **Enrollment & trials** | Complete | `enrollmentController.js`, `trialController.js` | `Enroll`, `EnrollWizard`, `QuickTrialModal` |
| **Payments & billing** (Stripe / PayPal / manual) | Complete | `stripeController.js`, `paymentController.js`, `manualPaymentController.js`, `checkoutService.js` | `Billing`, `CheckoutModal`, `InvoiceModal`, `PaymentResult` |
| **Coupons** | Complete | `couponController.js`, `couponService.js` | `CheckoutModal` (validate) |
| **Courses & progress** | Complete | `courseController.js`, `progressController.js` | `CoursesHub`, `CourseContent`, hub pages |
| **Quran reader & memorization** (flagship) | Complete | `hifz/quran-*` controllers, external quran.com API | `Quran.jsx` + `components/features/quran/*` |
| **Certificates** | Complete | `certificateController.js` | `CertificateCard` (on `Profile`) |
| **Notifications** | Complete | `notificationService.js`, `notificationController.js` | `NotificationPanel` (30s poll) |
| **Messaging** (1:1) | Complete | `messageController.js` | `Messages` |
| **Reviews** | Complete | `reviewController.js` | `CourseReviews`, `AdminReviewsTab` |
| **Community** (posts/comments/likes + moderation) | Complete | `communityController.js` | `Community`, `AdminCommunityTab` |
| **AI Tutor** (Anthropic, SSE streaming) | Complete | `aiTutorController.js`, `config/anthropic.js` | `AiTutor`, `TutorReviewWidget` |
| **Teacher workflow** (student records) | Complete | `teacherController.js`, `models/StudentRecord.js` | `TeacherDashboard`, `StudentModal` |
| **Parent workflow** (linked children) | Complete | `parentController.js` | `ParentDashboard`, `ChildModal` |
| **Live classes / calendar** | Complete | `liveClassController.js` | `CalendarPage`, `UpcomingClassCard` |
| **Referrals & gamification** | Complete | `referralController.js`, `progressController.js` (XP) | `ReferralCard` |
| **Blog** | Complete (live API) | `blogController.js`, `models/Blog.js` | `Blog`, `BlogPost` |
| **Newsletter / contact / search** | Complete | `subscriberController.js`, `contactController.js`, `searchController.js` | `Newsletter`, `CommandPalette` |
| **Admin console** (10 tabs + system controls) | Complete | `routes/v1/admin/*`, `systemController.js` | `AdminDashboard` + `components/features/admin/*` |
| **Islamic tools** (tasbeeh, qibla, prayer times, calendar, alphabet, adhkar, hadith) | Mostly client-side / external API | — | `pages/tools/*`, `components/features/tools/*` |
| **Homework** | **Preview / mock (no backend)** | none | `HomeworkPage` behind `PreviewBanner` |
| **Attendance** | **Preview / mock (no backend)** | none | `AttendancePage` behind `PreviewBanner` |
| **Public teacher directory** | **Static editorial (no accounts)** | none | `Teachers`, `TeacherProfile`, `data/marketing/teachers.js` |

---

## 5. Overall architecture

### Request path
```
Browser ── https://al-rahmaacademy.com ──► Vercel (static SPA)
   │                                          │ /api/* rewrite (vercel.json)
   │                                          ▼
   └──────────────────────────────────► Render: node server.js (Express)
                                              │
                                              ▼
                                         MongoDB Atlas
GitHub Actions cron ── Bearer CRON_SECRET ──► /api/cron/*
```

### Frontend provider stack (outer → inner)
`ErrorBoundary → QueryProvider → ThemeProvider → LangProvider → AuthProvider → AdminAuthProvider → BrowserRouter` ([frontend/src/App.jsx](../../frontend/src/App.jsx)). All pages are lazy-loaded; `RoutePrefetcher` warms route chunks. State split: **server state** = React Query hooks in `hooks/`; **client state** = contexts (auth/admin-auth/theme/lang/trial); **forms** = React Hook Form.

### Backend middleware pipeline ([backend/app.js](../../backend/app.js))
`helmet → cors → express.raw (Stripe webhook) → correlationId → express.json (100KB) → cookieParser → sanitizeMongo → CSRF (issue+verify, double-submit cookie) → requestLogger → health probes → apiLimiter → DB-connection check → routes → notFound → errorHandler`.

### Two route stacks (deliberate, mid-migration)
- **Legacy stack** (`routes/*.js`): public/student routes and admin **reads** (`protect` + `adminOnly`).
- **Admin v1 stack** (`routes/v1/admin/*`): every privileged admin **mutation**, behind `ipWhitelist → strict Helmet CSP → adminApiLimiter → verifyAccessToken → maintenanceGuard → requirePermissions()` RBAC + `auditFromReq` logging.

No privileged mutation may be added on the legacy stack. Migration status tracked in [../ROUTE_CONSOLIDATION_PLAN.md](../ROUTE_CONSOLIDATION_PLAN.md).

### Security & resilience posture (code-grounded)
- httpOnly JWT cookies + refresh-token **family rotation with reuse detection** ([models/RefreshToken.js](../../backend/models/RefreshToken.js)).
- Admin: TOTP MFA (speakeasy), per-account lockout (5 fails → 15 min), IP whitelist that **fails closed in production**, AES-256-GCM-encrypted MFA secrets.
- CSRF double-submit token; NoSQL-injection sanitizer; rate limiters that **fail open** on Redis outage (`passOnStoreError`).
- Kill-switches: `maintenance_mode` (503 for non-super-admin) and `financials_frozen` (blocks manual-payment approve/reject) in [models/SystemConfig.js](../../backend/models/SystemConfig.js).
- Immutable audit log ([models/SystemAuditLog.js](../../backend/models/SystemAuditLog.js)) — pre-hooks throw on update.
- Observability: `/health` (liveness, no DB), `/ready` (readiness, checks mongoose), Winston with `req.requestId` correlation, Render self-ping keep-alive.

### Internationalization
Custom `LangContext`, **6 locales** (en/ar/it/es/de/fr) in [frontend/src/i18n/](../../frontend/src/i18n/). Arabic (`ar`) sets `dir="rtl"`. A Vitest parity test enforces identical key structure across all six.

---

## 6. Tech stack summary

| Layer | Technology |
|---|---|
| Frontend framework | React 18 (StrictMode), Vite |
| Routing | React Router 6, route-level `lazy()` code-splitting |
| Server state | React Query 5 |
| Forms | React Hook Form 7 |
| HTTP | Axios (`http.js` user, `adminHttp.js` admin) |
| i18n | Custom `LangContext`, 6 locales |
| Theming | `ThemeContext` (`html.dark`), localStorage persistence |
| Error tracking | Sentry (browser) |
| Backend | Express 4, Mongoose |
| Auth | JWT httpOnly cookies, refresh rotation; admin TOTP MFA (speakeasy) |
| Payments | Stripe (recurring), PayPal, manual bank transfer |
| AI | Anthropic SDK (`claude-opus-4-8`), SSE streaming |
| Email | Nodemailer (SMTP) |
| Rate limiting | express-rate-limit, Redis-backed or in-memory |
| Logging | Winston (+ daily-rotate in prod) |
| Testing | Node built-in test runner (backend), Vitest (frontend), Playwright (e2e visual baselines) |
| Hosting | Vercel (SPA) + Render (API) + MongoDB Atlas + GitHub Actions (cron) |

---

## 7. Key external dependencies

- **Stripe & PayPal** — payment gateways (server-side price lookup; webhooks reconcile).
- **Anthropic API** — AI tutor (`ANTHROPIC_API_KEY`, model `claude-opus-4-8`).
- **quran.com / AlQuran APIs** — Quran verse text, audio, tafsir, reciters ([api/quran.js](../../frontend/src/api/quran.js)).
- **Google Identity** — Google sign-in (`POST /api/auth/google`).
- **SMTP provider** — transactional email (enrollment, reset, certificates, cron reports).
- **Redis** (optional) — distributed rate-limit store when `REDIS_URL` is set.

See [08_API_MAPPING.md](08_API_MAPPING.md) for the full endpoint surface and [03_USER_ROLES.md](03_USER_ROLES.md) for the permission model.
