# Mongo → Supabase Parity Map (Stage 2E)

Status: **NOT at 100% parity.** This document is the authoritative gap inventory behind
the Stage 2E Supabase adapter work in `backend/data/`. It compares the live MongoDB
backend (`backend/models/*.js`, confirmed live on Render as of commit `acbce80`)
against the Postgres/Supabase schema in `lib/db/drizzle/0000`–`0011` (20 tables,
**never applied to the real Supabase project `difzynyphojgisrfvrkd`** — local/rehearsal
only).

## Coverage summary

| # | Mongo model | Postgres table | Coverage |
|---|---|---|---|
| 1 | User (identity fields only) | `profiles` | Partial |
| 2 | User.subscription (embedded) | `subscriptions` | Partial (different shape) |
| 3 | Enrollment | `enrollments` | Partial |
| 4 | config/plans.js (static) | `plans` | Partial (static → DB-driven) |
| 5 | Payment | `payments` | Partial (different shape) |
| 6 | Invoice | `invoices` | Partial (no invoice-number field) |
| 7 | ManualPayment | `manual_payments` | Partial |
| 8 | Coupon | `coupons` + `coupon_redemptions` | Partial |
| 9 | Blog | `blogs` | Partial (3 fields missing) |
| 10 | — (no Mongo model) | `testimonials` | Postgres-only, net-new |
| 11 | TrialRequest | `trial_requests` | Good |
| 12 | Subscriber | `subscribers` | Good |
| 13 | Notification | `notifications` | Partial (8/14 types missing) |
| 14 | — (no Mongo model) | `notification_preferences` | Postgres-only, net-new |
| 15 | QuranBookmark | `quran_bookmarks` | Good |
| 16 | QuranReadingProgress | `quran_reading_progress` | Good (shape differs, adapter-transformable) |
| 17 | QuranMemorizationStats | `quran_memorization_stats` | Good |
| 18 | SystemAuditLog | `admin_audit_log` | Partial (no severity column; actor model differs) |
| 19 | Course, CourseProgress | **none** | **Missing** |
| 20 | LiveClass | **none** | **Missing** |
| 21 | Message | **none** | **Missing** |
| 22 | StudentRecord | **none** | **Missing** |
| 23 | HifzProgress | **none** | **Missing** |
| 24 | Certificate | **none** | **Missing** |
| 25 | Review | **none** | **Missing** |
| 26 | Referral | **none** | **Missing** |
| 27 | Wishlist | **none** | **Missing** |
| 28 | ContactMessage | **none** | **Missing** |
| 29 | SystemConfig | **none** | **Missing** |
| 30 | AdminUser (RBAC/MFA/refresh-token rotation) | **none** — only `profiles.role IN ('user','admin')` + Supabase Auth AAL2 | **Missing** (fundamental redesign, not a field gap) |
| 31 | Counter | n/a (Postgres uses UUIDs) | n/a — but see Invoice/Certificate numbering gap below |
| 32 | RefreshToken (admin-only) | **none** | **Missing** (part of AdminUser gap) |

**16 of 28 Mongo domains have a Postgres counterpart of some kind (rows 1–18, several
combined); 12 have none at all (rows 19–30, several combined) — including the LMS
content core (Courses), live-class scheduling, teacher grading records, the
student↔teacher DM system, and the entire admin RBAC/MFA system.**

Stage 2E scope (per explicit user decision) implements the Supabase adapter **only for
the matched domains (rows 1–18)**. Rows 19–30 are out of scope for this stage and need
their own schema-design stage (new migrations + RLS + RPCs, with the same rigor as
`0000`–`0011`) before an adapter can be attempted for them.

---

## Per-domain detail

### 1–2. User / profiles + subscriptions

`profiles` has only `id, email, name, role`. The Mongo `User` document additionally
carries: `subscription{plan,status,activeSince,validUntil,provider,stripeCustomerId,
stripeSubscriptionId,cancelAtPeriodEnd,renewalReminderSentFor}` (→ mapped to the
separate `subscriptions` table, different column names, RPC-only writes, one-active-
row-per-user constraint, immutable `user_id`/`provider` post-insert), `teacher`/
`children[]`/`parentLinkCode`/`familyName` (teacher-student linking — **no Postgres
column anywhere**), `xp/level/streak/badges` (gamification — **no Postgres column
anywhere**), `googleId` (OAuth — Postgres relies on `auth.users` for identity, Supabase
Auth's own Google provider would replace this, not a `profiles` column), `referralCode`
(**no Postgres column** — ties to the missing `Referral` table), `tokenVersion` (Mongo's
manual JWT-invalidation scheme — Supabase Auth has its own session-revocation model,
not a like-for-like column), teacher-profile fields `specialization/bio/gender/
languages/subjects/rating` (**no Postgres column anywhere**).

**Adapter scope**: `GET/PUT /api/auth/me` under `DATA_BACKEND=supabase` serves
`id/email/name/role` from `profiles` and subscription state from `subscriptions`
(reshaped to the Mongo-shaped response the frontend expects). Gamification, teacher-
linking, and referral-code fields are returned as `null`/omitted with a code comment —
**this is a real, intentional gap**, not an oversight; closing it needs new `profiles`
columns or new tables, out of scope here.

### 3. Enrollment → enrollments

Close field match (`name/email/whatsapp/country/city/timezone/times/subjects/lang/
level/ageGroup→age_group/genderPref→gender_pref/notes/status`). Field renames:
`teacherId/teacherName` → `preferred_teacher_key/preferred_teacher_name`; `plan` →
`requested_plan_slug`. Postgres `status` enum adds `'enrolled'` beyond Mongo's `pending/
contacted/enrolled/cancelled` (actually a superset — fine). Postgres enrollments has no
`user_id` (guest-submittable by design, RLS forces `status='new'` on insert) — matches
Mongo's public-form behavior already. **Adapter-transformable, no functional gap.**

### 4. config/plans.js → plans

Mongo has no `Plan` model — plan pricing lives in a static JS object
(`config/plans.js`: `PLANS.Starter/Standard/Premium`). Postgres has a full versioned
`plans` table with RPC-only writes (`create_plan_version`, `deactivate_plan`,
`admin_update_plan_display`) and an immutability trigger on price/product/slug once
created. **This is an architectural upgrade, not a gap** — the Supabase adapter reads
plan pricing from the `plans` table instead of the static file. One real requirement:
the `plans` table must be seeded (via `create_plan_version`) with rows matching the
current Starter/Standard/Premium pricing before the adapter can price anything —
handled by the migration/seed tooling, not a code gap.

### 5. Payment → payments

Mongo `Payment` is a single flat table for both gateways with a `raw` field holding the
full last gateway payload, and no concept of refunds as separate rows. Postgres
`payments` is a proper ledger: `kind IN (charge, refund)`, `parent_payment_id` self-FK
for refunds, snapshot pricing fields, a trigger that **freezes the entire row once
`status` reaches `succeeded`/`failed`**, and a refund-validation trigger enforcing the
refund total never exceeds the parent charge. There is **no raw INSERT/UPDATE policy
for any role including admin** — the only write path is `service_role` (webhook) inserts
and the `admin_record_refund()` RPC. **Adapter must call the RPC for refunds and rely on
`service_role` for webhook-driven charge inserts — it cannot replicate Mongo's pattern
of freely rewriting the `raw` field on every webhook retry.**

### 6. Invoice → invoices

**Real functional gap**: Postgres `invoices` has no invoice-number column at all (no
`INV-2026-0001`-style customer-facing identifier) — `Counter`-based auto-numbering has
no counterpart. `payment_id` is `NOT NULL` + `UNIQUE` (exactly one invoice per payment)
and the table is fully immutable + RPC-only (`issue_invoice_from_payment`) after
insert — matches Mongo's "invoices are a receipt, not an editable record" intent, but
the **missing invoice-number field means the customer-facing invoice display would
have nothing to show** without a schema change. Flagged as a required follow-up
migration, not solvable in the adapter layer alone.

### 7. ManualPayment → manual_payments

Good conceptual match. Mongo's atomic `findOneAndUpdate({status:'pending'})` claim
pattern maps directly to Postgres's `admin_review_manual_payment()` RPC (locks the row
`FOR UPDATE`, same double-processing protection). Field rename: `userId` → `user_id`,
`adminNote` → `admin_note`. Postgres adds `activated_at` (set by
`admin_activate_manual_subscription()`), which Mongo has no equivalent field for since
Mongo's activation is implicit (the transaction that approves also calls
`enrollUser`/`createInvoice` synchronously) — adapter must call both RPCs in sequence
to reproduce the same one-approval-action UX.

### 8. Coupon → coupons + coupon_redemptions

Mongo embeds `usedBy[{user,usedAt}]` in the coupon document; Postgres normalizes into a
`coupon_redemptions` join table (composite PK `coupon_id,user_id` — **one redemption per
user per coupon max**, whereas Mongo's array technically allows duplicates if not
guarded in application code — Postgres is stricter, which is fine). **Real gaps**:
Mongo's `applicablePlans[]` and `minOrderAmount` fields have no Postgres column —
Postgres coupons cannot currently be restricted to specific plans or a minimum order
amount. Postgres coupons additionally introduce `discount_scope IN (first_payment_only,
fixed_duration, forever)` — a recurring-discount model Mongo doesn't have at all
(forward-looking, not a regression, but changes checkout logic). Postgres also has
**no public/authenticated SELECT policy on `coupons`** (admin-only reads) — the live
`POST /api/coupons/validate` endpoint (used by regular users at checkout) has no RLS
path to check a coupon's validity directly; per the schema's own design comments this
was intentionally deferred to a not-yet-built "validate coupon" RPC. **The adapter needs
a new `validate_coupon_for_user()`-style RPC to be added (extending, not modifying, the
existing migrations) before checkout-time coupon validation can work under
`DATA_BACKEND=supabase`.**

### 9. Blog → blogs

**Real gaps**: Mongo's `category` (enum quran/tajweed/arabic/hifz/islamic-studies/
general), `readTime` (default 5), and `coverImage` (URL string) have no Postgres
column. Postgres's `seo_title`/`seo_description` flat columns map to Mongo's nested
`seo.{metaTitle,metaDescription}` (missing `canonicalUrl` counterpart). Author fields
match (`author_name/author_role/author_image` ↔ `author.{name,role,image}`).
Slug/title/excerpt/body↔content/tags/published/views/publishedAt all match cleanly.

### 11–12. TrialRequest / Subscriber

Clean matches, field-for-field (with the expected `snake_case` renames). No gaps.

### 13. Notification → notifications

**Real gap**: Postgres `notification_type` enum has only 7 values (`payment_received,
payment_failed, subscription_renewed, subscription_expiring, trial_status,
admin_announcement, daily_reminder`) vs. Mongo's 14 (missing: `class_scheduled,
class_cancelled, class_reminder, message_received, enrollment_approved,
enrollment_rejected, certificate_issued, coupon_received, review_approved` — 8 of 14
are absent from the Postgres enum). Note from the Mongo inventory: in the *current*
Mongo backend, `createNotification()` is defined but **never actually called** by any
other controller — so this gap has zero live behavioral impact today, but would block
wiring up in-app notifications for those 8 event types later, under either backend.

### 15–17. QuranBookmark / QuranReadingProgress / QuranMemorizationStats

Good matches. `quran_reading_progress.resume` (one `jsonb` blob) replaces Mongo's
structured `lastPosition{navMode,chapterId,pageNum,juzNum,hizbNum,verseKey,
verseTimestamp}` — an adapter-level shape transform, not a data-loss gap (all the same
information fits inside the jsonb blob, it's just nested differently on the Postgres
side). No `HifzProgress` counterpart exists (see the "Missing" list — per-surah
verse-range memorization tracking is entirely separate from `quran_memorization_stats`,
which is a practice-time/streak counter, not per-chapter progress).

### 18. SystemAuditLog → admin_audit_log

**Real gaps**: Mongo has a `severity` enum (`info/warning/critical`) — Postgres
`admin_audit_log` has no such column. Mongo's actor model references `AdminUser`
(the fully separate RBAC identity); Postgres's `actor_admin_id` references `profiles`
(the same table as regular users, distinguished only by `role='admin'`) — meaning any
adapter mapping requires deciding how `AdminUser` accounts (super-admin/admin/editor/
viewer with MFA/refresh-token rotation) map onto `profiles.role='admin'` (binary) plus
Supabase Auth's AAL2 step-up. **This is really part of the AdminUser gap (see below),
surfaced again here because the audit log is the one place both systems overlap.**

---

## Domains with zero Postgres counterpart (out of scope for Stage 2E)

- **Course, CourseProgress** — the entire LMS catalog (modules/lessons/resources,
  content locking by subscription status). This is core product content; a Supabase
  version needs new `courses`, `course_modules`, `course_lessons`, `course_progress`
  tables with RLS mirroring the "locked unless active subscription" rule.
- **LiveClass** — teacher/student class scheduling, no Postgres table.
- **Message** — the student↔teacher DM system (`canMessage` restricts to assigned
  pairs), no Postgres table.
- **StudentRecord** — teacher grading/attendance/homework notes, no Postgres table.
- **HifzProgress** — per-surah verse-range memorization tracking, no Postgres table
  (distinct from `quran_memorization_stats`, which only tracks practice time/streaks).
- **Certificate** — auto-numbered certificate issuance/revocation, no Postgres table
  (also needs the same invoice-numbering-style counter the `invoices` gap needs).
- **Review** — teacher/course ratings + moderation, no Postgres table.
- **Referral** — referral-code tracking/conversion, no Postgres table (also the reason
  `profiles.referralCode` has nowhere to live).
- **Wishlist** — per-user saved-courses list, no Postgres table.
- **ContactMessage** — public contact-form submissions + admin triage, no Postgres
  table.
- **SystemConfig** — the `maintenance_mode`/`financials_frozen` key-value flags that
  `maintenanceGuard`/`financialGuard` middleware read — no Postgres table, meaning
  those two middleware have nothing to check under `DATA_BACKEND=supabase` today.
- **AdminUser + RefreshToken** — the entire admin identity system: RBAC roles
  (`super-admin/admin/editor/viewer`) with granular permission strings, mandatory TOTP
  MFA with encrypted secrets, refresh-token-family rotation with reuse detection,
  per-account lockout, IP whitelist. Postgres substitutes a single `profiles.role`
  boolean-ish column plus Supabase Auth's own AAL2 MFA claim — **structurally
  incompatible with a field-mapping adapter**. Reaching parity here means either (a)
  building an equivalent permissions/roles table + admin-session model on top of
  Supabase Auth, or (b) deliberately simplifying the admin permission model as part of
  the cutover and accepting the behavior change — a product decision, not an
  engineering one, and explicitly flagged as an **UNKNOWN requiring a decision** before
  any admin-facing route can run under `DATA_BACKEND=supabase`.

These 12 domains need their own schema-design stage (new Drizzle migrations + RLS +
RPCs, reviewed with the same rigor as `0000`–`0011`, including the local
`test:db` suite) before a Supabase adapter can be attempted for them. Estimated scope
is comparable to or larger than the existing 20-table schema.

---

## Findings from the actual adapter implementation (`backend/data/supabase/`)

Building the adapter for the matched domains surfaced additional real gaps not
visible from reading the schema alone — these only showed up once real INSERT/
SELECT statements were run against the RLS/GRANT model:

- **`INSERT ... RETURNING` requires a SELECT-equivalent grant, which several
  guest-insert tables don't have.** `anon`/`authenticated` hold only a
  column-restricted INSERT grant on `trial_requests`, `subscribers`, and
  `enrollments` (see each domain's grant list above) — no SELECT grant at
  all. Postgres enforces privilege checks on `RETURNING` the same way it does
  on `SELECT`, so `INSERT ... RETURNING id` fails outright for a guest
  submission on all three tables, and the insert-column grant list also
  excludes `id`, so a client-generated UUID isn't an option either. Net
  effect: `POST /api/trials` and `POST /api/enrollments` cannot return the
  new row's `id`/`createdAt` the way the Mongo response does (the adapter
  responds with the submitted fields instead, `id: null` for enrollments);
  `POST /api/newsletter`'s idempotent upsert can't be verified as
  new-vs-duplicate from the response either (works around this by always
  reporting success, matching the Mongo contract's own already-idempotent
  200-either-way behavior).
- **`enrollments` has no owner/email-match SELECT policy at all** — only
  `enrollments_select_admin` (`is_admin()`). This means `GET /api/enrollments/
  mine` (a regular authenticated caller querying their own submission by
  email) returns zero rows under RLS even for their own data — this is a
  real, additional missing-policy gap beyond what the schema-reading pass
  found, and needs a new RLS policy (e.g. `email = auth.jwt()->>'email'`) to
  fix, not an adapter-side workaround.
- **`quran_reading_progress`/`quran_memorization_stats` `goal` is a bare
  integer column, not `{type, target}`** — Mongo's `dailyGoal.type` (verses/
  minutes/pages) has nowhere to live in Postgres; the adapter persists only
  the numeric target and drops the unit. `quran_memorization_stats` also has
  no history/date column at all (unlike `quran_reading_progress`, which at
  least has `history jsonb`), so there is no persisted signal to compute a
  real calendar-day streak — the adapter's practice-log streak under this
  backend is an explicit, documented approximation (increments per call, no
  gap-reset), not the real streak logic Mongo implements.
- **`notifications` has no bulk "mark all read" RPC** — only
  `mark_notification_read(p_id)` (one row at a time). The adapter implements
  mark-all as N sequential RPC calls in one transaction; documented as an
  O(n) round-trip cost, not a correctness gap.
- **`blogs`' view-increment on `GET /:slug` cannot run under `DATA_BACKEND=
  supabase`** — `anon`'s only grant on `blogs` is SELECT, no UPDATE grant
  exists for the view-count column, confirming the schema-reading pass's
  earlier suspicion.
- **`profiles.role` is a 2-value enum (`user`/`admin`)** — Mongo's
  student/teacher/parent/admin distinction collapses to `user` for everyone
  except admins under this backend (see `data/supabase/loadUser.js`). Any
  frontend logic branching on `role === 'teacher'`/`'parent'` would not
  behave correctly against a supabase-mode session — a real, structural gap,
  not just a missing field.
- **Manual payment admin review, coupon admin write, plan versioning, refund
  issuance, and reading `admin_audit_log` are all `is_admin_aal2()`-gated at
  the RLS/RPC level** — implemented as explicit `withAdminAal2Context()`
  calls that throw (see `client.js`'s module comment for why this backend
  cannot safely assert AAL2 on behalf of an admin). Confirmed additionally:
  `manual_payments`' INSERT policy requires `user_id = auth.uid()` with no
  anon-insert path — unlike Mongo's `softProtect`-based guest submission,
  `DATA_BACKEND=supabase` requires the caller to be signed in to submit a
  manual payment at all.
- **Stripe/PayPal checkout-session creation and webhook handling are
  explicitly out of scope for this pass** (`data/supabase/routes/
  paymentRoutes.js` returns 501 for all of them) — correctly reimplementing
  gateway signature verification, idempotency, and the transactional
  payments/subscriptions/invoices writes against this RLS/RPC model is
  substantial, high-risk work better done as its own dedicated, reviewed
  follow-up rather than rushed alongside everything else in Stage 2E.
- **`plans` has no `originalAmount`/`discountPct` columns** — `amount_minor`
  is a flat price; per-transaction discounts live on `payments` as a
  snapshot, not on the plan. The adapter's `getPlan()` returns `amount`
  (converted from minor units, seeded to match what customers currently pay)
  and `null` for the two marketing-display-only fields.
