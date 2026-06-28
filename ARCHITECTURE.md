# Al-Rahma Academy — Architecture

## Overview

Al-Rahma Academy is a full-stack online Islamic education platform built as a monorepo with a React SPA frontend and an Express.js REST API backend, deployed on Vercel.

```
d:\mahmoud-samy/
├── frontend/          React 18 + Vite + React Router 7 + React Query
├── backend/           Express 5 + Mongoose + Winston
├── api/index.js       Vercel serverless entry point (imports backend/app.js)
├── vercel.json        Deployment config (headers, rewrites, cron)
└── package.json       Monorepo root scripts
```

## Frontend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI Framework | React 18 (StrictMode) | Component tree |
| Router | React Router 7 | Client-side routing with code splitting |
| Server State | React Query 5 | Async data fetching, caching, invalidation |
| Form State | React Hook Form 7 | Uncontrolled forms with validation |
| HTTP Client | Axios | Same-origin API calls with CSRF header |
| i18n | Custom LangContext | 6 languages (en/ar/it/es/de/fr) |
| Theming | ThemeContext | Dark/light with localStorage persistence |
| Error Tracking | Sentry React | Browser error reporting |

### Context Providers (outer → inner)
```
ErrorBoundary
  QueryProvider    ← React Query client
    ThemeProvider  ← dark/light mode
      LangProvider ← i18n
        AuthProvider ← JWT auth state
          BrowserRouter
```

### Route Hierarchy
```
/                    → Home
/courses/*           → Course hierarchy (Hub → Details → Protected content)
/tools/*             → Islamic tools (Quran, Adhkar, Prayer, Qibla, Calendar…)
/resources/*         → Blog, FAQ
/academy/*           → About, Teachers, Privacy
/dashboard           → Student dashboard (protected)
/billing             → Invoices (protected)
/profile             → Profile (protected)
/messages            → Chat (protected)
/admin               → Admin dashboard (protected, admin-only)
/teacher             → Teacher portal (protected, teacher-only)
/parent              → Parent portal (protected, parent-only)
```

## Backend

### Express App Structure
```
app.js
  ↓ helmet + CORS
  ↓ raw body (Stripe webhook)
  ↓ JSON parser (100 KB limit)
  ↓ cookie-parser
  ↓ sanitizeMongo (NoSQL injection guard)
  ↓ issueCsrfToken (attaches readable cookie)
  ↓ verifyCsrfToken (validates X-CSRF-Token header on mutations)
  ↓ requestLogger (Winston structured logging)
  ↓ DB middleware (connectDB on every request)
  ↓ Routes
  ↓ notFound → errorHandler
```

### Database Models (24 total)

| Model | Purpose |
|-------|---------|
| User | Students, teachers, parents — subscription, tokens |
| AdminUser | Admin dashboard — RBAC, TOTP MFA |
| Course | Course content with nested modules + lessons |
| CourseProgress | Per-student lesson completion tracking |
| HifzProgress | Quran memorization (surah → verse level) |
| Certificate | Ijazah / completion certificates |
| Enrollment | 4-step intake form submissions |
| LiveClass | Scheduled one-to-one sessions |
| Payment | Stripe / PayPal checkout records |
| ManualPayment | Bank transfer / WU payment submissions |
| Invoice | Monthly billing records |
| Message | Teacher-student messaging threads |
| RefreshToken | JWT refresh token rotation (family-based) |
| StudentRecord | Teacher session progress notes |
| Subscriber | Newsletter email list |
| TrialRequest | Free trial form submissions |
| SystemAuditLog | Immutable admin action audit trail |
| SystemConfig | Runtime key-value configuration |
| **Review** | Teacher / course star ratings + moderation |
| **Notification** | In-app notifications (90-day TTL) |
| **Blog** | DB-backed blog posts with SEO fields |
| **Coupon** | Discount codes with validity rules |
| **Wishlist** | Per-user saved courses list |
| **ContactMessage** | Contact form submissions with workflow |

### API Route Map
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/courses
GET    /api/courses/:id       (protected — subscribed users)
GET    /api/search            (global: courses + posts + teachers)
GET    /api/search/courses
GET    /api/search/teachers
GET    /api/blog              (paginated, filterable)
GET    /api/blog/:slug
POST   /api/contact           (public)
GET/PATCH /api/notifications  (authenticated)
POST   /api/wishlist
DELETE /api/wishlist/:courseId
POST   /api/coupons/validate  (authenticated)
POST   /api/reviews           (authenticated)
GET    /api/reviews/teacher/:id
GET    /api/reviews/course/:id
GET    /api/payments/stripe
POST   /api/payments/paypal
GET    /api/invoices
…
GET    /api/v1/admin/*        (admin — MFA required)
```

## Security Architecture

| Control | Implementation |
|---------|---------------|
| Auth | httpOnly JWT cookies + refresh token rotation |
| CSRF | Double-submit cookie (readable `csrf_token` + `X-CSRF-Token` header) |
| Rate Limiting | Global (100/min) + Auth (20/15min) — Redis-backed in prod |
| Input Sanitisation | sanitizeMongo strips `$` operators; express-validator on controllers |
| NoSQL Injection | sanitizeMongo middleware |
| Password Hashing | bcrypt (12 rounds admin / 10 rounds user) |
| Secrets | AES-256-GCM encryption for TOTP secrets |
| Admin MFA | TOTP (speakeasy) enforced on every admin session |
| Audit Logging | Immutable SystemAuditLog for every admin action |
| CORS | Explicit allowlist; blocks cross-origin reads |
| CSP | Strict policy with upgrade-insecure-requests |
| HSTS | max-age=63072000 + preload |

## Deployment

- **Platform:** Vercel (serverless functions + CDN edge)
- **API:** Single serverless function at `api/index.js` (30 s max)
- **Frontend:** Pre-built Vite SPA served from `frontend/dist`
- **Database:** MongoDB Atlas (shared M0 or dedicated)
- **Cron:** Vercel Cron — daily renewal reminders at 09:00 UTC
- **Logging:** Winston (console in dev, rotating file + console in prod)
- **Error Tracking:** Sentry (frontend browser errors)
- **CDN:** Vercel Edge Network (automatic)
