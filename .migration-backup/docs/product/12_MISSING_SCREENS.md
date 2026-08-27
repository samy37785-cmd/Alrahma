# 12 — Missing Screens

> Screens that **should** exist given the product's implemented capabilities but currently **don't** (or exist only as mocks). Each entry explains why it's implied by existing code. This is gap analysis, not a mandate — the redesign decides what to build.

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md). Cross-refs: [05_SCREEN_INVENTORY.md](05_SCREEN_INVENTORY.md), [07_FEATURE_INVENTORY.md](07_FEATURE_INVENTORY.md).

**Method:** a "missing screen" is implied when a backend capability, model, or data relationship exists with no (or only mock) UI, or when a core flow lacks a state screen.

---

## A. Real backends for mocked screens

| Missing screen | Why implied | Evidence |
|---|---|---|
| **Homework (real)** | A `/homework` page and teacher `StudentRecord.homework` field exist, but there is **no `/api/homework/*`** — the page is a `PreviewBanner` mock. Teachers already record homework per session; a real homework assign/submit/grade surface is implied. | [HomeworkPage.jsx](../../frontend/src/pages/HomeworkPage.jsx), `StudentRecord` |
| **Attendance (real)** | `/attendance` is a mock; `StudentRecord.attendance` and `LiveClass` already model attendance. A real attendance-tracking screen tied to classes is implied. | [AttendancePage.jsx](../../frontend/src/pages/AttendancePage.jsx), `LiveClass`, `StudentRecord` |

## B. Account & subscription self-service

| Missing screen | Why implied |
|---|---|
| **Subscription management** (view plan, renewal date, cancel, change plan) | Backend models the full lifecycle (`subscriptionService`: activate/renew/deactivate/credit, `cancelAtPeriodEnd`, `validUntil`) but there's no student-facing subscription screen beyond invoices (`Billing`). `CancelSurvey` component exists, implying a cancel flow that has no home. |
| **Manual-payment status tracker** | Manual payments sit `pending` until admin approval; the student sees only a one-time `PaymentResult`. A persistent "your payment is under review / approved / rejected" screen is implied. |
| **Guest-checkout → account linking** | `softProtect` allows paying without an account; there's no screen to claim/link that payment to a newly created account. |

## C. Learning & progress

| Missing screen | Why implied |
|---|---|
| **Unified "My Progress / Journey"** | Progress, XP/level/streak/badges, hifz, and certificates exist as scattered cards; no consolidated progress view. `MilestoneCelebration`/`ShareAchievement` imply a journey worth showing. |
| **Certificates gallery** | Certificates are issued and listed on `Profile` via `CertificateCard`, but a dedicated certificates screen (filter by type, share, verify) is implied by the 4 certificate types + numbering. |
| **Referral dashboard** | `GET /api/referrals/me` returns the user's referrals and rewards, but only `ReferralCard` surfaces the code — a full referral-status screen (invited, converted, credits earned) is implied. |
| **Hifz overview** | `HifzProgress` per chapter + `QuranMemorizationStats` exist; a dedicated memorization-overview screen (all 114 chapters, progress heatmap) is implied beyond the in-reader controls. |

## D. Communication

| Missing screen | Why implied |
|---|---|
| **Notification center (full page)** | Only a bell dropdown (`NotificationPanel`) exists; notifications have 16 types + 90-day history — a full page with filtering is implied. |
| **Message thread management** | Messaging exists but is scoped/minimal; an archive/search/thread-list experience is implied by `Message` volume over time. **[needs verification]** current Messages depth. |

## E. Teacher & parent

| Missing screen | Why implied |
|---|---|
| **Teacher: class/session scheduling UI** | Teachers can `POST /api/classes` (staffOnly) but the scheduling surface within `TeacherDashboard` is thin. **[needs verification]** whether a full scheduler exists. |
| **Teacher: student progress deep-dive** | `getStudentDetail` returns rich per-student data (records, hifz stats); a dedicated analytics screen per student is implied. |
| **Parent: onboarding / how-to-link** | Parents must obtain a child's link code; there's no guided onboarding screen for the link flow (a common drop-off point). |
| **Parent: multi-child comparison / weekly report view** | Weekly reports are emailed; an in-app version of that report is implied (`buildChildReportData` already exists server-side). |

## F. Admin

| Missing screen | Why implied |
|---|---|
| **Admin analytics / dashboard overview** | The `/admin` "Overview" tab exists but the data surface is unclear; with payments, enrollments, users, and audit data available, a real KPI dashboard is implied. **[needs verification]** current Overview content. |
| **Admin certificate issuance workflow** | `POST /v1/admin/certificates` exists and `AdminProgressModal` is present, but a dedicated issuance screen (pick student → course → type → grade) is implied. |
| **Admin coupon management UI** | **Confirmed gap.** Full coupon CRUD API exists (`/v1/admin/coupons`) but there is **no coupon admin tab** — the 10 admin components contain none for coupons (verified via directory + `AdminDashboard.jsx` grep). Coupons can only be created/edited via the API directly. |
| **Admin blog editor** | **Confirmed gap.** Blog CRUD API exists (`/v1/admin/blog` with `blogValidation`/`blogUpdateValidation`) but there is **no admin blog-authoring screen** — no blog tab among the 10 admin components. Blog posts can only be authored via the API directly. |
| **System settings / kill-switch console** | `maintenance_mode` and `financials_frozen` toggles + audit-log query exist server-side, but there's no clearly documented admin UI to operate them (`AdminStaffTab` covers staff, not system). A system-controls screen is implied. |
| **Audit-log viewer** | `GET /v1/admin/system/audit-log` returns immutable audit entries; a dedicated searchable audit-log screen is implied for compliance. |

## G. Global

| Missing screen | Why implied |
|---|---|
| **Search results page** | Search is exposed via Command Palette overlay only; a full `/search?q=` results page is implied by `GET /api/search`. |
| **Error / offline / maintenance page** | `maintenance_mode` returns 503 backend-side; a branded maintenance screen for the SPA is implied. Only `NotFound` (404) exists. **[needs verification]** whether a maintenance UI exists. |

---

## Summary — most impactful missing screens

1. **Subscription management + manual-payment status** (B) — closes real gaps in the revenue flow.
2. **Real Homework & Attendance** (A) — replace mocks or remove; highest trust impact.
3. **Notification center + unified My Progress** (C, D) — ties the learning loop together.
4. **Admin system-controls, audit-log, coupon/blog management screens** (F) — surface powerful backend features that have thin/absent UI.

Several "missing admin screen" items are flagged **[needs verification]** because the admin tab set may already cover them under a different name — confirm against `components/features/admin/*` before treating as true gaps.
