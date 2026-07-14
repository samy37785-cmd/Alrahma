# 04 — User Flows

> Every significant end-to-end journey, with the components and endpoints touched at each step. Sources: [checkoutService.js](../../backend/services/checkoutService.js), [adminAuthController.js](../../backend/controllers/adminAuthController.js), [authController.js](../../backend/controllers/authController.js), plus the route/controller inventory in [08_API_MAPPING.md](08_API_MAPPING.md).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md).

**Cross-cutting note:** every mutating request is preceded by CSRF setup — axios interceptors in [api/http.js](../../frontend/src/api/http.js) call `ensureCsrfToken()` ([api/csrf.js](../../frontend/src/api/csrf.js)) → `GET /api/csrf` warms the `csrf_token` cookie, echoed back as the `X-CSRF-Token` header. This step is implicit in all flows below.

---

## 1. Student registration & login

```
Register.jsx / Login.jsx (React Hook Form)
  → api/authApi.js
    → POST /api/auth/register | /api/auth/login   (authController)
      → sets httpOnly `token` JWT cookie (JWT_SECRET, HS256, v=tokenVersion)
  → AuthContext populates user via GET /api/auth/me
  → redirect to role dashboard (role-aware)
```
- Register forces role to `student`/`parent` (no self-service teacher/admin).
- **Google sign-in:** `POST /api/auth/google` exchanges a Google ID token → session.
- **Password reset:** `POST /api/auth/forgot-password` (always 200, emails a hashed-token link) → `ResetPassword.jsx` → `POST /api/auth/reset-password` → **bumps `tokenVersion`** (invalidates existing sessions).
- **Password change** via `PUT /api/auth/me` similarly bumps `tokenVersion`.

**States:** loading (submit), field validation (express-validator → `{message}` 422), invalid credentials, rate-limited (`authLimiter`, 20/15min).

---

## 2. Admin login (TOTP MFA, two-stage)

```
AdminLogin.jsx → api/adminAuthApi.js (via api/adminHttp.js)

Stage 1 — password
  POST /api/v1/admin/auth/login   (loginLimiter, loginValidation)
    → returns { stage: 'mfa' | 'mfa_setup' }, sets 10-min pre-auth cookie

Stage 2a — first-time setup (stage='mfa_setup')
  POST /mfa/setup    → { QR data URL, base32 secret }
  POST /mfa/confirm  → verifies first TOTP → activates MFA, starts full session

Stage 2b — existing (stage='mfa')
  POST /mfa/verify   → verifies TOTP → issues access+refresh cookies
                       → returns { admin: { permissions } }
```
- **Session refresh:** `POST /refresh` rotates the refresh token with **family reuse detection** — a replayed token revokes the whole family (`TOKEN_REUSE`). Access cookie TTL 15 min (path `/api/v1/admin`); refresh 7 days (path `/api/v1/admin/auth/refresh`).
- **Lockout:** 5 failed attempts → 15-min lock ([AdminUser.js](../../backend/models/AdminUser.js) `incrementFailedAttempts`).
- **Route protection:** `/admin` requires BOTH `ProtectedRoute adminOnly` (regular `User.role==='admin'`) AND `AdminSessionGate` (the AdminUser MFA session). [adminHttp.js](../../frontend/src/api/adminHttp.js) clears cached admin profile and hard-redirects to `/admin/login` on any 401.

**States:** stage transitions, TOTP entry, QR display (setup), locked account, IP-denied (403 before login even renders if whitelist blocks), rate-limited.

---

## 3. Enrollment & payment (the revenue path)

### 3a. Lead capture (pre-payment)
- **Trial request:** `Trial.jsx` / `QuickTrialModal.jsx` → `POST /api/trials` (public, emails admin + student). Admin sees them in `AdminTrialsTab`.
- **Enrollment form:** `Enroll.jsx` + `EnrollWizard.jsx` (multi-step) → `POST /api/enrollments` (public, `enrollmentLimiter` 5/15min; emails admin + student). Admin sees them in the enrollments list.

### 3b. Checkout → subscription
`CheckoutModal.jsx` offers three payment paths; **pricing is server-authoritative** ([config/plans.js](../../backend/config/plans.js) — never trusted from the client). Optional coupon validated via `POST /api/coupons/validate`.

```
STRIPE (recurring)
  POST /api/payments/stripe (softProtect) → Stripe Checkout redirect
  → POST /api/payments/stripe/webhook (raw body, registered before JSON parser)
      • checkout.session.completed → fulfillPaidCheckout
      • invoice.paid              → renewal
      • customer.subscription.deleted → deactivate
PAYPAL
  POST /api/payments/paypal → approve → POST /paypal/:orderId/capture
  (+ /paypal/webhook safety net) → finalizePaypalOrder (idempotent)
MANUAL (bank transfer / WU / MoneyGram / Payoneer / PayPal.me)
  POST /api/payments/manual (softProtect) → status: pending
  → admin PATCH /api/v1/admin/payments/manual/:id (approve)
```

All three converge on **one canonical post-payment sequence** — `fulfillPaidCheckout` ([checkoutService.js](../../backend/services/checkoutService.js)), run **inside a MongoDB transaction**:
```
redeem coupon (atomic per-user + maxUses guard)
  → activate subscription (30-day one-time OR recurring Stripe)
  → create invoice (idempotent on gatewayInvoiceId, auto INV-YYYY-#### number)
  → createNotification to the student
```
- **Result screen:** `PaymentResult.jsx` at `/payment/success` | `/payment/cancel`.
- **Access gate afterward:** `User.hasActiveSubscription()` (status active AND `validUntil` in future) unlocks gated course content and Quran persistence.
- **Idempotency:** webhooks + manual approval all guard against double-fulfillment (atomic status claim → 409 on double).

**States:** plan selection, coupon apply/invalid, gateway redirect, success, cancel, manual "pending admin approval", double-submit prevention.

---

## 4. Course consumption & progress

```
/courses hub → course landing → (subscription active) → /courses/:id (CourseContent.jsx)
  GET /api/courses/:id (protect) → resources locked:true unless hasActiveSubscription()
  toggle lesson done → PUT /api/progress/:courseId (subscription-gated)
    → awards XP (XP_PER_LESSON=20), updates level/streak/badges  [gamification]
```
Progress stored in [CourseProgress.js](../../backend/models/CourseProgress.js) (`completed[]` of resource URLs / `lesson:<id>`). Gamification fields live on `User.gamification`.

**States:** locked (no subscription — shows `locked:true` payload), empty course, lesson complete/incomplete, XP/level-up celebration (`MilestoneCelebration`).

---

## 5. Quran reader & memorization (flagship)

```
/tools/quran-reader (Quran.jsx)
  nav modes: Surah | Page | Juz | Hizb   (orthogonal to)
  reading modes: Continuous (QuranMushafPage) | Verse-by-Verse (QuranVerseList)
  external data: api/quran.js → quran.com/AlQuran (verses, audio, tafsir, reciters)
  two separate engines:
    useQuranAudioEngine  → verse-synced playback
    useQuranHifz         → repeat/test memorization drills
  persistence (logged-in only):
    bookmarks/notes/highlights → /api/quran-bookmarks
    reading position + streak  → /api/quran-progress
    memorization stats + recording → /api/quran-memo
    Hifz chapter tracking      → /api/hifz
```
Recording studio (`QuranRecordingStudio` + `useQuranRecorder`) captures practice audio; stats logged via `POST /api/quran-memo/log`.

**States:** loading verses (external API), reciter/audio switching, offline persistence unavailable for guests, streak update, recording in progress.

---

## 6. Certificate issuance

```
Admin/teacher (AdminDashboard / AdminProgressModal)
  → POST /api/v1/admin/certificates (requires certificates:write)
    → create Certificate (auto CERT-YYYY-#### number, issuedBy = req.adminUser)
    → auditFromReq(...)  → createNotification(student)  → email (certificateIssuedEmail)
Student
  → GET /api/certificates/mine (on Profile.jsx) → rendered by CertificateCard.jsx (print template)
Revoke
  → DELETE /api/v1/admin/certificates/:id → soft revoked:true
```
Types: `ijazah | completion | hifz | attendance`.

**States:** issue form, issued (with notification + email side-effects), revoked, student view/print.

---

## 7. Notifications

```
Any flow → createNotification() (notificationService, session-aware, no-ops on falsy recipient)
Student → GET /api/notifications/unread (polled every 30s) → NotificationPanel bell badge
  → PATCH /:id/read | PATCH /read-all | DELETE /:id
```
Fired from payment / class / certificate / message / review / community-moderation / cron flows. Notifications TTL 90 days. **Independent** of the Messages unread badge (`GET /api/messages/unread/count`).

---

## 8. Teacher workflow

```
TeacherDashboard.jsx → api/teacherApi.js (teacherOnly)
  GET /api/teacher/students        → assigned students + summary (batched aggregations)
  GET /api/teacher/students/:id    → one student full profile
  POST /api/teacher/students/:id/records → add session/follow-up record (StudentModal.jsx)
  DELETE /api/teacher/records/:recordId  → delete own record
  (+ staffOnly) POST /api/classes  → schedule a live class (limited to own students)
```
Records stored in [StudentRecord.js](../../backend/models/StudentRecord.js) (grade, attendance, memo range, tajweed, homework, note).

**States:** no assigned students, per-student drill-in, record CRUD, class scheduling.

---

## 9. Parent workflow

```
ParentDashboard.jsx → api/parentApi.js (parentOnly)
  POST /api/parent/link (child's parentLinkCode)  → link child
  GET /api/parent/children        → children list
  GET /api/parent/children/:id    → child detail (ChildModal.jsx)
  DELETE /api/parent/children/:id → unlink
Weekly digest:
  GET /api/cron/weekly-parent-reports (cron-authed) → per-child email
    (streak, lessons this week, XP, level, next class)
```
Link code obtained by the student via `GET /api/auth/link-code`.

**States:** no children linked, invalid link code, child progress detail, weekly email.

---

## 10. Supporting flows

| Flow | Path |
|---|---|
| **Messaging** | `Messages.jsx` → `GET /contacts`, `GET /:userId` (marks read), `POST /messages` — student↔assigned-teacher only (`canMessage`) |
| **Community** | `Community.jsx` → `GET/POST /posts`, like, comments (all created `pending`); admin moderates via `AdminCommunityTab` → `PATCH /v1/admin/community/*` |
| **Reviews** | student `POST /api/reviews` (one per target); public `GET /teacher/:id` `/course/:id`; admin `PATCH /v1/admin/reviews/:id/moderate` |
| **AI Tutor** | `AiTutor.jsx` → conversations CRUD; `POST /conversations/:id/messages` streams SSE from Anthropic (`aiTutorLimiter`, daily per-user cap) |
| **Referrals** | code = last 8 of `User._id`; `POST /api/referrals/track`; admin `PATCH /v1/admin/referrals/:id/convert` → 30-day credit to **both** parties (transactional) |
| **Wishlist** | `Wishlist.jsx` → `GET/POST/DELETE /api/wishlist` |
| **Search** | `CommandPalette` (Ctrl+K) → `GET /api/search`, `/courses`, `/teachers` (public) |
| **Newsletter / Contact** | `POST /api/newsletter`, `POST /api/contact` (public, stores IP) |

---

## 11. Admin operational flows

| Flow | Endpoint(s) | Guard |
|---|---|---|
| Manage users (roles, subscription, teacher assignment, family) | `/v1/admin/users/*` | `users:read/write/delete` |
| Manage courses (CRUD + cascade delete) | `/v1/admin/courses/*` | `courses:*` |
| Approve/reject manual payments | `PATCH /v1/admin/payments/manual/:id` | `payments:write` + `financialGuard` |
| Moderate community / reviews | `/v1/admin/community/*`, `/v1/admin/reviews/*` | `community:write` / `reviews:write` |
| Blog / coupons / contact / referrals / certificates | `/v1/admin/{blog,coupons,contact,referrals,certificates}/*` | respective `*:write` |
| **Kill-switches** (maintenance, financial freeze) | `POST /v1/admin/system/maintenance`, `/financial-freeze` | `requireAdminRole('super-admin')` |
| Audit log (read / GDPR purge) | `GET/DELETE /v1/admin/system/audit-log` | `audit:read` / super-admin |
| Provision admin accounts | `POST /v1/admin/system/admins` | super-admin |

All admin mutations are audited to the immutable [SystemAuditLog.js](../../backend/models/SystemAuditLog.js).

See [05_SCREEN_INVENTORY.md](05_SCREEN_INVENTORY.md) for the screen-level states each flow renders, and [10_UX_PROBLEMS.md](10_UX_PROBLEMS.md) for where flow feedback/states are missing.
