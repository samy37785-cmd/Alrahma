# 08 — API Mapping

> Every backend endpoint: method, path, auth/guards, validation, frontend consumer, purpose, and error behavior. Route mounts: [backend/app.js](../../backend/app.js). Companion engineering reference: [../API.md](../API.md).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md). Role/guard semantics: [03_USER_ROLES.md](03_USER_ROLES.md).

---

## Conventions (apply to all endpoints)

- **Base:** `/api`. All JSON. **Error contract:** always `{ "message": "..." }` (validation errors → 422 via `handleValidationErrors`; `11000` dup key → 409; Mongoose ValidationError → 400; unknown → 500 leak-safe in prod). Source: [middleware/errorHandler.js](../../backend/middleware/errorHandler.js), [utils/validationHelper.js](../../backend/utils/validationHelper.js).
- **CSRF:** every mutating request needs `X-CSRF-Token` echoing the `csrf_token` cookie (double-submit). Exempt: safe methods, Stripe/PayPal webhooks, `/api/cron/*`.
- **Auth cookies:** user = httpOnly `token`; admin = `admin_at` (access) + `admin_rt` (refresh).
- **Rate limits** (fail-open on store error): `apiLimiter` 300, `authLimiter` 20, `enrollmentLimiter` 5, `aiTutorLimiter` 20, `communityLimiter` 15 (per 15 min); admin: `loginLimiter` 5, `mfaLimiter` 10, `refreshLimiter` 20, `adminApiLimiter` 200.
- **Two stacks:** legacy (`protect`/role guards) vs admin v1 (`/api/v1/admin/*`, full RBAC pipeline). No privileged mutation may be added on the legacy stack.

Guard column abbreviations: `pub` = public, `P` = `protect`, `A` = `adminOnly`, `T` = `teacherOnly`, `Par` = `parentOnly`, `S` = `staffOnly`, `soft` = `softProtect`, `perm:x` = `requirePermissions('x')`, `SA` = `requireAdminRole('super-admin')`, `VA` = `verifyAccessToken`.

---

## 1. System / health (no auth)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/` | pub | Root liveness |
| GET | `/health` | pub | Liveness (no DB) |
| GET | `/ready` | pub | Readiness (checks mongoose state) |
| GET | `/api/csrf` | pub | Warm CSRF cookie (DB-free) |

## 2. Auth — `/api/auth` (whole router behind `authLimiter`)

| Method | Path | Guard | Validation | Consumer | Purpose |
|---|---|---|---|---|---|
| POST | `/register` | pub | `registerValidation` | `authApi` | Register (role → student/parent) |
| POST | `/login` | pub | `loginValidation` | `authApi` | Password login, set `token` cookie |
| POST | `/logout` | pub | — | `authApi` | Clear cookie |
| GET | `/me` | P | — | `AuthContext` | Current profile |
| PUT | `/me` | P | — | `authApi` | Update name/email/password (bumps tokenVersion) |
| POST | `/forgot-password` | pub | — | `authApi` | Email reset link (always 200) |
| POST | `/reset-password` | pub | — | `authApi` | Reset via hashed token |
| POST | `/google` | pub | — | `authApi` | Google ID-token exchange |
| GET | `/link-code` | P | — | `authApi` | Student's parent-link code |

## 3. Courses / progress / hifz

| Method | Path | Guard | Consumer | Purpose |
|---|---|---|---|---|
| GET | `/api/courses` | pub | `courseApi` | Catalogue (paid content stripped, cached 5min) |
| GET | `/api/courses/:id` | P | `courseApi` | One course; resources `locked:true` unless active sub |
| GET | `/api/progress/user/:userId` | P+A | `courseApi` | Student progress report (admin) |
| GET | `/api/progress/:courseId` | P | `courseApi` | My progress |
| PUT | `/api/progress/:courseId` | P | `courseApi` | Toggle lesson (sub-gated, awards XP) |
| GET | `/api/hifz` | P | `courseApi` | My memorization progress |
| PUT | `/api/hifz/:chapterId` | P | `courseApi` | Mark/unmark verse range |
| GET | `/api/hifz/user/:userId` | P+A | — | A student's hifz (admin) |

## 4. Quran persistence

| Method | Path | Guard | Consumer | Purpose |
|---|---|---|---|---|
| GET/POST | `/api/quran-bookmarks` | P | `quranBookmarkApi` | List / upsert bookmark |
| DELETE | `/api/quran-bookmarks/:verseKey` | P | `quranBookmarkApi` | Remove bookmark |
| GET | `/api/quran-progress` | P | `quranProgressApi` | Reading progress |
| PUT | `/api/quran-progress/position` | P | `quranProgressApi` | Update last position |
| PUT | `/api/quran-progress/goal` | P | `quranProgressApi` | Update reading goal |
| POST | `/api/quran-progress/log` | P | `quranProgressApi` | Log reading (streak) |
| GET | `/api/quran-memo` | P | `quranMemoApi` | Memorization stats |
| PUT | `/api/quran-memo/goal` | P | `quranMemoApi` | Update memo goal |
| POST | `/api/quran-memo/log` | P | `quranMemoApi` | Log practice/recording |

> **External** (not this backend): [api/quran.js](../../frontend/src/api/quran.js) calls quran.com/AlQuran for verses, audio, tafsir, reciters, search.

## 5. Enrollment / trials / newsletter / contact

| Method | Path | Guard | Validation | Consumer | Purpose |
|---|---|---|---|---|---|
| POST | `/api/enrollments` | `enrollmentLimiter` | — | `enrollmentApi` | Public enrollment submit (emails) |
| GET | `/api/enrollments/mine` | P | — | `enrollmentApi` | My enrollment |
| GET | `/api/enrollments` | P+A | — | `enrollmentApi` | Admin list |
| POST | `/api/trials` | pub | — | `contentApi` | Trial request (emails) |
| GET | `/api/trials` | P+A | — | `contentApi` | Admin list |
| POST | `/api/newsletter` | pub | — | `contentApi` | Subscribe |
| GET | `/api/newsletter` | P+A | — | `contentApi` | Admin list |
| POST | `/api/contact` | pub | `contactValidation` | `contentApi` | Contact form (stores IP) |
| GET | `/api/contact` | P+A | — | `contentApi` | Admin list |

## 6. Payments / invoices / coupons

| Method | Path | Guard | Consumer | Purpose |
|---|---|---|---|---|
| POST | `/api/payments/stripe/webhook` | Stripe HMAC (raw body) | — | Stripe events (checkout/renewal/cancel) |
| POST | `/api/payments/stripe` | soft | `paymentApi` | Create Stripe Checkout session |
| POST | `/api/payments/paypal/webhook` | PayPal sig | — | PayPal safety-net |
| POST | `/api/payments/paypal` | soft | `paymentApi` | Create PayPal order |
| POST | `/api/payments/paypal/:orderId/capture` | pub | `paymentApi` | Capture PayPal order |
| GET | `/api/payments/manual-methods` | pub | `paymentApi` | Configured manual methods |
| POST | `/api/payments/manual` | soft | `paymentApi` | Submit manual payment |
| GET | `/api/invoices/admin` | P+A | `paymentApi` | All invoices |
| GET | `/api/invoices` | P | `paymentApi` | My invoices |
| GET | `/api/invoices/:id` | P | `paymentApi` | One invoice (ownership) |
| POST | `/api/coupons/validate` | P | `paymentApi` | Validate coupon (plan-aware) |
| GET | `/api/coupons` | P+A | `adminApi` | Admin list |

## 7. Classes / teacher / parent

| Method | Path | Guard | Consumer | Purpose |
|---|---|---|---|---|
| GET | `/api/classes` | P | `classApi` | Role-aware list |
| POST | `/api/classes` | P+S | `classApi` | Schedule class |
| PATCH | `/api/classes/:id` | P+S | `classApi` | Update/reschedule/cancel |
| DELETE | `/api/classes/:id` | P+S | `classApi` | Delete |
| GET | `/api/teacher/students` | P+T | `teacherApi` | My students + summary |
| GET | `/api/teacher/students/:id` | P+T | `teacherApi` | Student detail |
| POST | `/api/teacher/students/:id/records` | P+T | `teacherApi` | Add record |
| DELETE | `/api/teacher/records/:recordId` | P+T | `teacherApi` | Delete own record |
| POST | `/api/parent/link` | P+Par | `parentApi` | Link child by code |
| GET | `/api/parent/children` | P+Par | `parentApi` | Children list |
| GET | `/api/parent/children/:id` | P+Par | `parentApi` | Child detail |
| DELETE | `/api/parent/children/:id` | P+Par | `parentApi` | Unlink |

## 8. Messaging / notifications

| Method | Path | Guard | Consumer | Purpose |
|---|---|---|---|---|
| GET | `/api/messages/contacts` | P | `messageApi` | Contact list |
| GET | `/api/messages/unread/count` | P | `messageApi` | Unread messages badge |
| POST | `/api/messages` | P | `messageApi` | Send (scoped by `canMessage`) |
| GET | `/api/messages/:userId` | P | `messageApi` | Conversation (marks read) |
| GET | `/api/notifications` | P | `notificationApi` | List |
| GET | `/api/notifications/unread` | P | `notificationApi` | Bell badge (30s poll) |
| PATCH | `/api/notifications/read-all` | P | `notificationApi` | Mark all read |
| PATCH | `/api/notifications/:id/read` | P | `notificationApi` | Mark read |
| DELETE | `/api/notifications/:id` | P | `notificationApi` | Delete |

## 9. Certificates / reviews / community / wishlist / blog / referrals / search / AI

| Method | Path | Guard | Validation | Consumer | Purpose |
|---|---|---|---|---|---|
| GET | `/api/certificates/mine` | P | — | `courseApi` | My certificates |
| GET | `/api/certificates` | P+A | — | — | Admin list |
| POST | `/api/reviews` | P | `reviewValidation` | `reviewApi` | Create review (one per target) |
| GET | `/api/reviews` | P+A | — | `reviewApi` | Admin list |
| GET | `/api/reviews/teacher/:teacherId` | pub | — | `reviewApi` | Teacher reviews + stats |
| GET | `/api/reviews/course/:courseId` | pub | — | `reviewApi` | Course reviews + stats |
| GET | `/api/community/posts` | P | — | `communityApi` | Approved feed |
| GET | `/api/community/posts/mine` | P | — | `communityApi` | My posts |
| POST | `/api/community/posts` | P + `communityLimiter` | `postValidation` | `communityApi` | Create post (pending) |
| DELETE | `/api/community/posts/:id` | P | — | `communityApi` | Delete own post |
| POST | `/api/community/posts/:id/like` | P | — | `communityApi` | Toggle like |
| GET | `/api/community/posts/:id/comments` | P | — | `communityApi` | Approved comments |
| POST | `/api/community/posts/:id/comments` | P + `communityLimiter` | `commentValidation` | `communityApi` | Create comment (pending) |
| DELETE | `/api/community/comments/:id` | P | — | `communityApi` | Delete own comment |
| GET | `/api/community/admin/posts` | P+A | — | — | Moderation queue |
| GET | `/api/community/admin/comments` | P+A | — | — | Moderation queue |
| GET/POST | `/api/wishlist` | P | — | `wishlistApi` | List / add |
| DELETE | `/api/wishlist/clear` | P | — | `wishlistApi` | Clear |
| DELETE | `/api/wishlist/:courseId` | P | — | `wishlistApi` | Remove one |
| GET | `/api/blog` | pub | — | `blogApi` | Published list (cached) |
| GET | `/api/blog/:slug` | pub | — | `blogApi` | One post (`$inc views`) |
| GET | `/api/referrals/me` | P | — | — | My referrals |
| POST | `/api/referrals/track` | P | — | — | Track referral |
| GET | `/api/search` · `/courses` · `/teachers` | pub | — | `searchApi` | Search |
| GET/POST | `/api/ai-tutor/conversations` | P | — | `aiTutorApi` | List / create |
| GET/DELETE | `/api/ai-tutor/conversations/:id` | P | — | `aiTutorApi` | Get / delete |
| POST | `/api/ai-tutor/conversations/:id/messages` | P + `aiTutorLimiter` | `sendMessageValidation` | `aiTutorApi` | Stream reply (SSE), daily cap |

## 10. Cron — `/api/cron` (guarded by `cronAuth`, constant-time `CRON_SECRET`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cron/renewal-reminders` | Email/notify subs expiring within `RENEWAL_REMINDER_DAYS` (default 3); idempotent per billing period |
| GET | `/api/cron/weekly-parent-reports` | Weekly per-child progress email to parents |

503 if `CRON_SECRET` unset; 401 on mismatch. CSRF-exempt.

---

## 11. Admin v1 — `/api/v1/admin/*`

**Every route** first passes: `ipWhitelist → strict Helmet CSP → adminApiLimiter → sanitizeMongo`, then `/auth` is public-within-admin, and all others pass `verifyAccessToken → maintenanceGuard` before RBAC. Mutations audited to `SystemAuditLog`.

### `/auth`
| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/login` | `loginLimiter`, `loginValidation` | Stage-1 password → pre-auth cookie |
| POST | `/mfa/setup` | `mfaLimiter` | Generate TOTP secret + QR |
| POST | `/mfa/confirm` | `mfaLimiter`, `mfaTokenValidation` | Activate MFA, start session |
| POST | `/mfa/verify` | `mfaLimiter`, `mfaTokenValidation` | Verify TOTP → full session |
| POST | `/refresh` | `refreshLimiter` | Rotate refresh (reuse detection) |
| POST | `/logout` | VA | Revoke refresh family |

Consumer: `adminAuthApi` via `adminHttp`.

### `/users` (CRUD factory + custom) — consumer `adminApi`
| Method | Path | Guard |
|---|---|---|
| GET | `/teachers` | perm:users:read |
| POST | `/` | perm:users:write (admin-role create → SA) |
| PATCH | `/:id/role` | perm:users:write |
| PATCH | `/:id/subscription` | perm:users:write |
| PATCH | `/:id/teacher` | perm:users:write |
| PATCH | `/:id/family` | perm:users:write |
| GET | `/` | perm:users:read (paginated, search name/email) |
| GET | `/:id` | perm:users:read |
| PUT | `/:id` | perm:users:write (allowlisted fields) |
| DELETE | `/:id` | perm:users:delete |

### `/courses` — consumer `courseApi` (admin path)
`GET /`, `GET /:id` (perm:courses:read) · `POST /`, `PUT /:id` (perm:courses:write) · `DELETE /:id` (perm:courses:delete, `deleteCourseCascade`, audit `course.delete`). Note: `allowedFilters:['level','published']`; unrecognized filters silently dropped.

### `/enrollments` — CRUD factory
`GET`, `GET /:id` (perm:enrollments:read) · `POST`, `PUT`, `DELETE` (perm:enrollments:write).

### `/payments`
`GET /manual` (perm:payments:read) · `PATCH /manual/:id` (perm:payments:write + `financialGuard`; SA bypasses freeze).

### Content moderation & mutation
| Path | Method | Guard |
|---|---|---|
| `/blog` | POST `/`, PATCH `/:id`, DELETE `/:id` | perm:blog:write (+ blog validators) |
| `/coupons` | POST `/`, PATCH `/:id`, DELETE `/:id` | perm:coupons:write |
| `/contact` | PATCH `/:id` | perm:contact:write |
| `/certificates` | POST `/`, DELETE `/:id` | perm:certificates:write |
| `/referrals` | PATCH `/:id/convert` | perm:referrals:write |
| `/reviews` | PATCH `/:id/moderate` | perm:reviews:write |
| `/community` | PATCH `/posts/:id/moderate`, `/comments/:id/moderate` | perm:community:write |

### `/system`
| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/status` | any admin | Maintenance/freeze flags |
| POST | `/maintenance` | SA | Toggle maintenance mode |
| POST | `/financial-freeze` | SA | Toggle financial freeze |
| GET | `/audit-log` | perm:audit:read | Query audit log |
| DELETE | `/audit-log` | SA | GDPR purge (≥90 days) |
| GET | `/admins` | SA | List admin accounts |
| POST | `/admins` | SA, `createAdminValidation` | Create admin |

---

## 12. Endpoint relationships (data lineage)

- **Payment convergence:** `stripe` / `paypal` / `manual` → all → `fulfillPaidCheckout` → `subscriptionService` + `invoiceService` + `notificationService` (one transactional path).
- **Notification fan-in:** payment / class / certificate / message / review / community-moderation / cron all call `createNotification`.
- **Progress → gamification:** `PUT /api/progress/:courseId` mutates `CourseProgress` **and** `User.gamification` (XP/level/streak/badges).
- **Referral reward:** `PATCH /v1/admin/referrals/:id/convert` → `grantSubscriptionCredit` for **both** referrer and referee.
- **Audit fan-in:** every `/v1/admin/*` mutation → `auditFromReq` → immutable `SystemAuditLog`.
- **Counter dependency:** invoice & certificate numbering both use `Counter.nextSeq` (atomic).

## 13. Coverage note

This mapping enumerates every router mounted in [backend/app.js](../../backend/app.js) and every endpoint within them, cross-checked against the route files. If a new route file is added, verify it appears both in `app.js` mounts and here. **[needs verification]** exact request/response body schemas per endpoint are in the validators (`backend/validators/`) and controllers — see [../API.md](../API.md) for representative payloads; this doc focuses on surface, guards, and relationships.
