# Product Data Scope Reset + Supabase Minimal Baseline Audit

**Date:** 2026-08-28 (revised)
**Scope of evidence:** `artifacts/al-rahma-academy` and `artifacts/api-server` only.
`.migration-backup/` (the old MongoDB/Express backend) is historical
reference only and was deliberately excluded as a source of truth for this
audit.

**Revision note:** this replaces the first version of this document. The
first version left 3 open questions (course/plan catalog shape, Stripe
one-time-vs-subscription, admin tab scope) — the product owner has now
answered all three plus added several corrections (notifications restored,
`plans`/`subscriptions`/`notification_preferences` added, `profiles.role`
narrowed to `user`/`admin` only). This version reflects those decisions.
**The 13-table proposal in the first version is no longer current — do not
build against it.**

**This is a report only.** No RLS, no migration, no changes to the live
Supabase project, no `drizzle-kit push`, no push/merge/deploy. That work
starts only once this revised document is approved.

## 1. Current Product Feature Inventory

Unchanged from the first version — re-derived from `artifacts/al-rahma-
academy`'s actual code only. See §3 for how the verdicts per table changed
based on the product owner's new decisions below; the underlying evidence
(which pages/forms/API calls are real vs. dead) did not change.

## 2. Current API/Data Flow

Unchanged from the first version: `artifacts/api-server` handles exactly
one route locally (`GET /healthz`); every other `/api/*` call is a
transparent reverse-proxy to the real Render backend. No `vercel.json`/
dev-proxy exists yet in `artifacts/al-rahma-academy` to reproduce that
mapping outside the current Replit-style same-origin setup. The Quran
tool's external API calls (`api/quran.js`) remain fully independent of any
backend.

## 3. Locked Product Decisions (this revision)

1. **Accounts** — exactly two kinds: `user` and `admin`. Public
   registration always creates a `user`; `admin` can never be selected or
   granted via public signup or client-supplied metadata, no matter what
   is sent. `profiles.role` is a 2-value enum (`user`, `admin`) — not the
   old system's `student`/`teacher`/`parent`/`admin`. Sensitive admin
   operations require AAL2 (Supabase's MFA assurance level) — an
   auth/RLS-design concern for the next stage, noted here so the schema
   accounts for it (no schema change needed for this by itself). Removing
   `isTeacher`/`isParent`/role-routing from the frontend is explicitly
   **out of scope for this task** — noted for later, not done now.
2. **What a `user` account keeps**: basic account fields; Quran bookmarks;
   Quran reading progress; Quran memorization stats; notifications +
   notification preferences; their own subscription and invoices (read
   access to what belongs to them).
3. **Plans/pricing**: a small admin-manageable `plans` table (not an LMS
   `courses` table — marketing course content stays a static, code-level
   concern as it is today). The frontend never sends a trusted amount or
   determines the final price; the server resolves the plan from the DB
   and verifies it against the payment provider's own price ID. Changing a
   Stripe price means creating a new Stripe Price and deactivating the
   old one — a historical Stripe Price is never edited in place.
4. **Payments are recurring** (Stripe = monthly subscription, not a
   one-time purchase). `subscriptions` is a new table, separate from
   `payments`: `subscriptions` holds the current subscription state per
   user; `payments` holds every individual transaction/invoice payment
   attempt (a history log, not a state machine). Stripe webhooks are the
   source of truth for subscription state — never client-reported status.
   Idempotency via unique constraints on gateway event/payment/
   subscription IDs is a hard requirement (schema-level, not just
   application logic). PayPal is modeled as a subscription only if the
   integration actually used supports real recurring billing — otherwise
   it's documented as a separate, non-recurring path rather than forced
   into the same shape. `manual_payments` represents a single period's
   proof-of-payment for admin review, and must never auto-convert into an
   active subscription without an explicit, atomic admin-approval step
   (an RLS/RPC-design concern for the next stage — schema just needs to
   support "pending → approved/rejected" as a distinct state, not silently
   imply approval).
5. **Notifications are back in** (removed from DROP), but re-scoped away
   from the old LMS event types. New type set: `payment_received`,
   `payment_failed`, `subscription_renewed`, `subscription_expiring`,
   `trial_status`, `admin_announcement`, `daily_reminder`. A new
   `notification_preferences` table holds per-user daily-reminder
   opt-in/time, language, and timezone. In-app only for now — no push
   tokens/device registration table; web push or email delivery is a
   later decision, not built speculatively. Users only ever read/mark
   their own notifications; only admin/system processes create them (an
   RLS concern for the next stage, but shapes today's schema: no
   "recipient" ambiguity, no user-authored notifications).
6. **Approved admin scope**: Overview (limited), Users, Enrollments, Trial
   requests, Plans/pricing, Subscriptions, Payments/manual payments/
   invoices/refunds, Coupons, Blog, Testimonials, Newsletter,
   Notifications/announcements. Explicitly **not** in scope: teacher
   management, parent/student dashboards, classes, certificates,
   community.
7. **Testimonials** (replacing Reviews): admin-curated only. No
   `reviewer_id`/user-account link, no user-submission flow, no moderation
   workflow (there's nothing to moderate — admin writes and publishes
   directly, like a blog post).

## 4. Required vs Obsolete Tables (recomputed)

Of the 34 tables pushed in the now-superseded `ae47640`:

**KEEP — 14 tables (unchanged shape or lightly redesigned):** `profiles`
(role narrowed to `user`/`admin`), `quran_bookmarks`,
`quran_reading_progress`, `quran_memorization_stats`, `enrollments`,
`payments` (redesigned — a transaction-attempt log, not subscription
state), `manual_payments`, `invoices`, `coupons`, `coupon_redemptions`,
`trial_requests`, `subscribers`, `blogs`, `notifications` (restored,
type set narrowed).

**NEW — 4 tables:** `plans`, `subscriptions`, `notification_preferences`,
`testimonials` (replaces `reviews`).

**DROP — 20 tables** (LMS/teacher-parent-student system, or already
orphaned/dead regardless of the scope decision): `profile_children`,
`admin_lockouts`, `courses`, `course_progress`, `certificates`,
`student_records`, `live_classes`, `hifz_progress`, `referrals`,
`messages`, `reviews` (superseded by `testimonials`), `posts`,
`post_likes`, `comments`, `wishlist_items`, `tutor_conversations`
(deferred, not deleted-forever), `system_config`, `system_audit_log`,
`rate_limit_counters`, `contact_messages` (confirmed dead — the submit
function has zero call sites, no Contact page exists).

14 KEEP + 20 DROP = 34 ✓ (accounts for every table `ae47640` pushed).
Final minimal schema = 14 + 4 new = **18 tables**.

## 5. Required Authentication Model

`profiles(id → auth.users, email, name, role enum('user','admin') default
'user', created_at, updated_at)`. Public registration always inserts
`role='user'` regardless of any client-supplied metadata — the insert
trigger enforces this unconditionally (simpler than the prior draft's
parent/student branching, since there is no such branching anymore).
Promoting an account to `admin` is a deliberate out-of-band action (e.g. a
direct, audited DB operation), never a signup-time choice. Sensitive admin
actions (the tabs listed in §3.6) require AAL2 — enforced at the RLS/route
level in the next stage, not a schema concern today.

No gamification (xp/level/streak/badges), no teacher/parent fields, no
`subscription_*` columns on `profiles` itself (subscription state lives in
the new `subscriptions` table, not denormalized onto the account row).

## 6. Minimal Supabase Schema Proposal (18 tables)

| Table | Purpose | Key columns (illustrative, not final DDL) |
|---|---|---|
| `profiles` | account identity | id (→auth.users), email, name, role enum(user,admin), created_at, updated_at |
| `quran_bookmarks` | reader bookmarks | user_id, verse_key, chapter_id, verse_num, note, color |
| `quran_reading_progress` | reader resume/streak | user_id (PK), resume jsonb, goal, streak, history jsonb |
| `quran_memorization_stats` | hifz-tool stats | user_id (PK), goal, total_recordings, total_practice_time, streak |
| `enrollments` | booking/lead form | name, email, whatsapp, country, city, timezone, lang, level, age_group, gender_pref, plan (text, pre-commitment lead — not a `plan_id` FK), status, notes |
| `plans` (NEW) | admin-managed pricing catalog | id, slug (unique), name, amount, currency, billing_interval, stripe_product_id, stripe_price_id, paypal_plan_id, sessions_per_week, sessions_per_month, active, display_order, created_at, updated_at |
| `subscriptions` (NEW) | current subscription state per user | id, user_id, provider, provider_customer_id, provider_subscription_id (unique), plan_id (→plans), status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at |
| `payments` | every transaction/invoice attempt | id, user_id (nullable), subscription_id (nullable, →subscriptions), plan_id (→plans), gateway, gateway_event_id (unique, webhook idempotency), gateway_payment_id (unique), amount, currency, status (incl. `refunded`), raw jsonb, created_at |
| `manual_payments` | period proof-of-payment for admin review | user_id (nullable), plan_id (→plans), amount, currency, method, reference, status (pending/approved/rejected — approval is a separate atomic step, never implicit), admin_note, created_at, reviewed_at |
| `invoices` | receipts | user_id, plan_id (→plans), amount, currency, status, payment_id (→payments), gateway_invoice_id (unique) |
| `coupons` | discount codes | code (unique), type, value, max_uses, expires_at, active |
| `coupon_redemptions` | per-user usage | coupon_id, user_id |
| `trial_requests` | free-trial leads | name, email, phone, course/plan, message, status |
| `subscribers` | newsletter | email (unique), status |
| `blogs` | content | title, slug (unique), content, excerpt, tags, published, views |
| `testimonials` (NEW) | admin-curated social proof | author_name, author_role, quote, rating?, context (free text), published, created_by (→profiles, admin), created_at |
| `notifications` | in-app notices | user_id, type enum(payment_received, payment_failed, subscription_renewed, subscription_expiring, trial_status, admin_announcement, daily_reminder), title, body, link, read, meta jsonb, created_at |
| `notification_preferences` (NEW) | per-user notification settings | user_id (PK), daily_reminder_enabled, daily_reminder_time, language, timezone, created_at, updated_at |

## 7. Plan for commit `ae47640`

**`ae47640` is superseded and not a valid base to build on as-is.** Its
34-table schema encodes the wrong (LMS) product scope and predates every
decision in §3. Per the earlier recommendation (kept): don't `git revert`
— author a fresh commit for the 18-table schema above (reusing the
existing `lib/db/src/schema/*.ts` files as a starting point where the
table survives, replacing them where the shape changed materially, adding
new files for `plans`/`subscriptions`/`notification_preferences`/
`testimonials`). `ae47640` stays in git history unmodified; the new
commit's message states plainly that it supersedes `ae47640`'s scope.

## 8. Cleanup Plan for the 34 Live Supabase Tables (still described, not executed)

Unchanged reasoning from the first version: the Supabase project is
confirmed not wired to any live app and holds no real user data. Once
approved, the safe path is a clean drop of all 34 tables + the
`handle_new_user` trigger, followed by a fresh push of the 18-table
schema — not an in-place `ALTER`, since several tables change shape
materially (`payments` in particular). Should happen in the same pass as
authoring the new schema files.

## 9. Remaining Open Items (design-stage, not blocking this report)

- Exact RLS shape for AAL2-gated admin actions, and for "user reads only
  their own notifications/subscriptions/invoices" — next stage (RLS
  design), not this document.
- Atomic approval flow for `manual_payments` → `subscriptions` (must not
  be a bare `UPDATE`, needs the same race-safe claim pattern the old
  backend used) — an RPC/RLS design detail for the next stage.
- PayPal recurring-vs-one-time confirmation depends on which PayPal API
  the checkout flow actually calls — to be confirmed when `payments`/
  `subscriptions` are wired to real endpoints, not guessed here.

## Status

- `scripts/post-merge.sh`'s risky `pnpm --filter db push` line is already
  removed and committed (commit `3c10a40`).
- No RLS written. No migration applied or reverted on the real Supabase
  project. No push, merge, or deploy. `ae47640` still sits as-is, local
  only, on `main`, and is now explicitly documented as superseded.

## Next Step

Once this revised document is approved: author the 18-table minimal
schema (new/replaced `lib/db/src/schema/*.ts` files), drop-and-replace the
34 live Supabase tables with it (verified the same way Stage 1 was — real
push, real read-back), write local tests, then move to RLS design scoped
to this final table set. No push/merge/deploy at any point without being
asked.
