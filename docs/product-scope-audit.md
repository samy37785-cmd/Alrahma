# Product Data Scope Reset + Supabase Minimal Baseline Audit

**Date:** 2026-08-28 (final — self-contained)
**Branch:** `docs/product-scope-closure-v3` (off `cf24eb7` on `main`)
**Scope of evidence:** `artifacts/al-rahma-academy` and `artifacts/api-server` only.
`.migration-backup/` (the old MongoDB/Express backend) is historical
reference only and was never used as a source of truth for any decision
in this document.

This document is self-contained — it does not require reading prior git
history to understand why any table was kept, dropped, or added.

## ⚠️ What approving this document does and does not authorize

**Approving this document approves a *design* only.** It does **not**
authorize:
- dropping, altering, or applying anything on the real Supabase project,
- running `drizzle-kit push` (not used as a deployment mechanism at all —
  see §11),
- any `git push`, merge, or deploy.

Every one of those is a **separate, explicit permission**, asked for at
the time it's actually about to happen. Beyond that: **the schema alone
is never applied to any remote environment, even once fully finished.**
RLS can be designed later, locally — but schema, RLS, and grants must all
be complete and tested together before any remote apply happens, as one
single, separately-permitted release. A schema-only partial apply is
explicitly out of scope for every stage of this work, not just this
document.

## 1. Current Product Feature Inventory (inlined, evidence-based)

Built from a full read of `artifacts/al-rahma-academy`'s routes, forms,
API layer, and `artifacts/api-server` — not `.migration-backup`.

**Real, wired, but CUT per the product owner's decision** (the old
teacher/parent/student system and its educational dashboards are not part
of the product going forward, regardless of currently being wired): the
`role` field (student/teacher/parent/admin) and all role-based routing/
nav; the student `Dashboard.jsx`, `TeacherDashboard.jsx`,
`ParentDashboard.jsx`; `CourseContent.jsx` (lesson viewer) + course
progress; `StudentModal.jsx` (teacher notes on students); live-class
scheduling; Hifz progress as a teacher-assessed record; certificate
issuance; parent↔child linking; dashboard messages/notifications (the old
shape — see §5 for what's kept instead); `AttendancePage.jsx`/
`HomeworkPage.jsx` (already explicitly fake/preview via their own in-code
`PreviewBanner` — never real to begin with); Community (posts/comments/
likes) and Wishlist (explicitly out of scope); referrals (already
orphaned — link generation with no backing API calls anywhere); AI Tutor
(explicitly deferred, not deleted-forever).

**Real, wired, STAYS**: public marketing pages/hubs (static content, not
DB-driven); Blog; trial-request lead capture; newsletter signup; course
enrollment + real payment (Stripe/PayPal/manual, now modeled as a
recurring subscription — see §7); a plain, non-role user account kept for
Quran-tool progress persistence; the Quran reader tool and its 3
persistence hooks (bookmarks, reading progress, memorization stats); most
standalone client tools (Adhkar, Hadith library, Prayer times, Qibla,
Islamic calendar, Verse-of-the-day, Tasbeeh, Arabic alphabet, Hifz-review
flashcards) — client-only or calling fully external, secret-free APIs,
needing no backend at all; the hardened internal admin login (TOTP MFA,
separate from the regular-user system) — this is the "internal admin"
kept, scoped down to only the surviving features (§6).

**Real, wired, REDESIGNED**: course/teacher Reviews → replaced by a plain
admin-curated **Testimonials** table (no reviewer account, no dashboard,
no moderation workflow — admin authors and publishes directly).

**Confirmed not real / already dead**, unaffected by the scope decision:
`contact_messages` — the submit function exists in the data layer but has
zero call sites; no Contact page exists. `TajweedCheckerPage.jsx` brands
itself "AI-Powered" but makes no AI/backend call at all — a labeling
inaccuracy, not a schema question. Also dead: `classApi.updateClass`,
`courseApi.getMyHifz`/`markHifz`, `enrollmentApi.getEnrollments`/
`updateEnrollment`, `notificationApi.deleteNotif`, `quran.searchQuran`,
and the entire `searchApi.js` feature (implemented end-to-end, zero UI
entry point) — noted for later cleanup, not acted on here.

## 2. Current API/Data Flow (inlined)

`artifacts/api-server` handles exactly one route locally
(`GET /healthz`); every other `/api/*` call — including every one this
document keeps — is a transparent reverse-proxy to `UPSTREAM_API_ORIGIN`
(defaults to the real Render backend). No `vercel.json` and no dev-proxy
config exist yet in `artifacts/al-rahma-academy` to reproduce that mapping
outside the current Replit-style same-origin setup — addressing that is a
later stage, not started here. The Quran tool's external API calls
(`api/quran.js`) bypass this entirely — no backend involvement, already
and permanently independent of Render/Supabase.

## 3. Locked Account & Checkout Policy

- Exactly two account kinds: `user` and `admin`. Public registration
  always creates `role='user'`; `admin` can never be selected or granted
  via public signup or any client-supplied metadata, no matter what is
  sent — the insert trigger enforces this unconditionally (§11). No
  `student`/`teacher`/`parent`/`editor`/`viewer`/`super-admin`.
  `role` is never user-editable. Sensitive admin operations require AAL2
  (Supabase's MFA assurance level) — an RLS-design concern for the next
  stage, noted here so the schema accounts for it correctly today.
- Free-trial requests and the enrollment/lead form can be submitted
  **without** an account (matches `Enroll.jsx`/`Trial.jsx`'s real
  behavior — no login gate on either today). Starting any **paid**
  checkout (Stripe, PayPal, or manual-payment submission) requires being
  logged in as a `user`. Consequently `subscriptions.user_id`,
  `invoices.user_id`, `payments.user_id`, and `manual_payments.user_id`
  are all **NOT NULL**.
- No account is ever silently created from an email address inside a
  webhook handler — an account only ever comes from a real Supabase Auth
  signup.
- A `user` account keeps: basic identity fields; Quran bookmarks; Quran
  reading progress; Quran memorization stats; notifications +
  notification preferences; their own subscription and invoices (read
  access to what belongs to them — an RLS concern for later, but the
  schema is shaped to make that check trivial: every row a user should
  see has a direct `user_id` column).

## 4. Plans & Pricing

A small, admin-manageable `plans` table (not an LMS `courses` table —
marketing course content stays static, code-level content as it is
today; `plans` is pricing/catalog data only). The frontend never sends a
trusted amount or determines the final price; the server resolves the
plan from the DB and verifies it against the payment provider's own price
ID. Changing a Stripe price means creating a new Stripe Price and
deactivating the old one — a historical Stripe Price (or a historical
`plans` row) is never edited in place; every `payments`/`invoices` row
also snapshots the plan's price/currency/provider-price-id *at the time
of that payment* (§7), so a later plan change never reinterprets
historical financial records.

**Currency (baseline remediation — corrected from an earlier, weakly-
evidenced "USD" conclusion):** `currency_code` is `EUR` only, directly
re-verified against the live app. `Pricing.jsx`'s canonical/base price
data is EUR (a client-side USD/GBP/SAR toggle exists but is display-only
— `CheckoutModal.jsx`'s actual pay button hardcodes `€` regardless of
that toggle, so no real charge is ever made in anything but EUR).
`TermsOfService.jsx` states outright, across all 6 locales, that prices
are in EUR and VAT-inclusive — a contractual statement, not a UI detail.
The earlier "USD" conclusion rested on an env var (`BANK_CURRENCY`) that
had no literal value in the repo and doesn't even exist inside the live
app's own directory; the same variable, wherever it's genuinely set,
is itself `EUR`. Not widened to `['EUR', 'USD']` — the USD toggle never
reaches an actual charge, so treating it as a real transactional
currency would be guessing wider than the evidence shows, the same
mistake being corrected here just in the other direction.

## 5. Notifications

Restored (not dropped), re-scoped away from the old LMS event types.
Type set: `payment_received`, `payment_failed`, `subscription_renewed`,
`subscription_expiring`, `trial_status`, `admin_announcement`,
`daily_reminder`. A `notification_preferences` table holds per-user
daily-reminder opt-in/time, language, and timezone — **language allowlist
is `en`/`ar`/`it`/`es`/`de`/`fr`** (baseline remediation: corrected from
an earlier `en`/`ar`-only narrowing that turned out to be based on a
mistaken read of an unrelated column; re-verified directly against the
live app's actual i18n system — `i18n/index.js`'s `LANGS` const, 6
complete translation files, a working `/{lang}/...` router, a passing
routing test — which genuinely serves all 6). In-app only for now —
no push tokens/device registration table; web push or email delivery is
a later decision, not built speculatively. **The scheduler/cron that
would actually enqueue `daily_reminder` rows is explicitly not part of
this baseline** — the schema only guarantees that *if* something tries to
insert a duplicate reminder, the database rejects it (a `dedupe_key`
uniqueness constraint, §9). Users only ever read/mark their own
notifications; only admin/system processes create them.

## 6. Approved Admin Scope

Overview (limited), Users, Enrollments, Trial requests, Plans/pricing,
Subscriptions, Payments/manual payments/invoices/refunds, Coupons, Blog,
Testimonials, Newsletter, Notifications/announcements. Explicitly **not**
in scope: teacher management, parent/student dashboards, classes,
certificates, community.

## 7. Payment Model

Stripe is a **recurring monthly subscription**, not a one-time purchase.
`subscriptions` is a table separate from `payments`: `subscriptions`
holds the current subscription state per user; `payments` is an
**append-oriented financial ledger** — every individual transaction
attempt is its own row, with a small, explicit set of safe status
transitions (`pending → succeeded`, `pending → failed`; nothing else
mutates once a row is finalized). A **refund is always a new row**
(`kind='refund'`, linked via `parent_payment_id`), never an update that
flips the original charge's status — this supports multiple and partial
refunds against one charge naturally, and keeps the ledger's history
honest. A refund insert is validated by a real trigger
(`validate_refund_insert()`, baseline remediation — a first version only
checked the parent's `kind`, which a review found left real corruption
risk): the parent charge is locked (`SELECT ... FOR UPDATE`, serializing
concurrent refunds against it), must itself be `status = 'succeeded'`,
the refund's `user_id`/`currency_snapshot`/`gateway` must match the
parent's, and the running total of refunds against that parent (this one
included) can never exceed the original charge amount — verified with a
real two-connection concurrency test, not just a sequential one.

Stripe webhooks (recorded through `provider_events`, §8) are the sole
source of truth for subscription state — the client never self-reports
"I'm subscribed now." PayPal (the current Orders-API integration) is a
**single payment granting a fixed access period**, not a recurring
subscription — `subscriptions` still gets a row (so "does this user
currently have access" is one query regardless of provider), but its
`cancel_at_period_end`/`canceled_at` fields don't meaningfully apply to
it; it simply expires at `current_period_end` unless a new payment
extends it. A real PayPal *subscriptions* API integration, if built
later, is a separately-designed path. Manual payment follows the same
fixed-period-grant shape, reviewed by admin — activating the
corresponding `subscriptions` row happens **only** via an atomic RPC
after admin approval (never an implicit side effect of
`manual_payments.status` changing; the exact RPC is a later-stage design
item, deferred, not built in this pass — see §12).

Money is always **`amount_minor`, an integer in minor currency units**
(cents), never a bare float. Three related amounts are distinguished by
name on every `payments`/`invoices` row: **`amount_minor`** is the actual
amount charged; **`plan_amount_minor_snapshot`** is the plan's price
*before* any discount; **`discount_minor_snapshot`** is the actual
discount applied — for a charge row, `amount_minor` reconciles to
`plan_amount_minor_snapshot - discount_minor_snapshot`. No full raw
gateway webhook payload is ever stored on `payments` — only a small,
explicitly allowlisted `gateway_metadata` (payment-method brand, masked
last4, receipt URL; never full card data or a full billing address unless
a real feature needs it). Full (redacted) payloads live only in
`provider_events` (§8), and even there are hashed/summarized, not stored
verbatim.

Coupons must state their own discount duration explicitly — a
`discount_scope` (`first_payment_only` / `fixed_duration` / `forever`)
plus a `discount_duration_cycles` (used only for `fixed_duration`) —
nothing assumes a coupon discount silently applies forever on a recurring
subscription.

## 8. Webhook Idempotency — `provider_events`

Every inbound Stripe/PayPal webhook event is recorded here **before**
being acted on — this is the real idempotency boundary, decoupled from
`payments`. Columns: `provider`, `provider_event_id`, `event_type`,
`payload_hash` (integrity/dedup check) plus a small redacted
`payload_summary` (never the full raw payload with secrets),
`received_at`, `processed_at`, `processing_status`
(`pending`/`processing`/`processed`/`failed`/`ignored`), `error_code`.
**`unique(provider, provider_event_id)`** is the hard idempotency
guarantee — a duplicate webhook delivery is rejected at the database
level before any business logic runs. A duplicate-delivery unique
violation is an expected, caught outcome (idempotent success), never
treated as a 500 error by whatever code eventually processes these.

**Claiming is two-phase (baseline remediation — a first version claimed
*after* doing the side-effect work, which a review found didn't actually
prevent two workers from both performing it):** `claim_provider_event()`
does the atomic `pending → processing` claim **before** any side-effect
work runs — only the worker that gets a row back may proceed;
`complete_provider_event()` then does `processing → processed/failed`
once the work is actually done. A second claim attempt on an
already-claimed event returns zero rows (idempotent no-op), verified with
a real two-connection concurrency test.

## 9. Enrollment Form — Exact Field List

Corrected to match the real form, not a generic guess: `name`, `email`,
`whatsapp`, `country`, `city`, `timezone`, **`times`** (jsonb array —
availability slots), **`subjects`** (jsonb array), `lang`, `level`,
`age_group`, `gender_pref`, **`preferred_teacher_key`** (a stable
identifier for a **static, non-account-backed** teacher-directory entry —
`Teachers.jsx`'s directory is real editorial marketing content, just not
tied to any real account, so this is intentionally not a foreign key to
`profiles`), **`preferred_teacher_name`** (a snapshot string, so the lead
record still reads sensibly even if the directory entry is later renamed
or removed), **`requested_plan_slug`** (a snapshot of the plan the lead
selected — text, never a live FK, and never trusted as a financial
reference — it's a lead-capture snapshot only), `status`, `notes`,
timestamps. No `user_id` — enrollment stays guest-submittable (§3). If a
future product decision removes teacher selection from the UI entirely,
that is a **separate UI decision** — this schema does not silently drop
the already-existing lead-data shape in anticipation of it.

## 10. Testimonials

Admin-curated only. No `reviewer_id`/user-account link, no user-
submission flow, no moderation workflow — admin writes and publishes
directly, like a blog post. `rating`, if present, is 1–5.

## 11. Authentication Model

`profiles(id → auth.users, email, name, role enum('user','admin') default
'user', created_at, updated_at)`. The insert trigger on `auth.users`
always creates `role='user'`, ignoring any client-supplied metadata role
claim entirely — no branching logic of any kind. Email/password signup
only, unless phone auth is explicitly decided and documented later — not
assumed. Promoting an account to `admin` is a deliberate out-of-band
action (a direct, audited operation), never a signup-time choice or a
client-callable RPC. No gamification, no teacher/parent fields, no
`subscription_*` columns on `profiles` itself (that state lives in
`subscriptions`, not denormalized onto the account row).

## 12. Table Inventory — Final Recount

Of the 34 tables pushed in the now-superseded `ae47640`:

**KEEP — 14 tables** (redesigned per §3–§11 where noted): `profiles`,
`quran_bookmarks`, `quran_reading_progress`, `quran_memorization_stats`,
`enrollments`, `payments`, `manual_payments`, `invoices`, `coupons`,
`coupon_redemptions`, `trial_requests`, `subscribers`, `blogs`,
`notifications`.

**NEW — 6 tables**: `plans`, `subscriptions`, `notification_preferences`,
`testimonials`, `provider_events`, `admin_audit_log`.

**DROP — 20 tables**: `profile_children`, `admin_lockouts`, `courses`,
`course_progress`, `certificates`, `student_records`, `live_classes`,
`hifz_progress`, `referrals`, `messages`, `reviews` (superseded by
`testimonials`), `posts`, `post_likes`, `comments`, `wishlist_items`,
`tutor_conversations` (deferred), `system_config`, `system_audit_log`,
`rate_limit_counters`, `contact_messages`.

14 KEEP + 20 DROP = 34 ✓ (every table `ae47640` pushed is accounted for).

**Final schema = 14 + 6 = 20 tables**, `public` schema only — does
**not** include `auth.users` (Supabase-managed, never created or counted
as one of ours).

**`ae47640` is superseded and is not a valid base to build on as-is** —
its 34-table schema encodes the old LMS product scope and predates every
decision in this document.

## 13. Migration Policy

`drizzle-kit push` is **not** used as a deployment mechanism going
forward. It applies a computed diff directly with no reviewable artifact
— acceptable for Stage 1's throwaway verification pass, wrong for
anything meant to be durable and auditable. From here on, schema changes
are expressed as **versioned SQL migration files**, reviewed as a diff
before ever being applied to any database, real or otherwise.

## 14. Remaining Deferred Items (explicitly not built in this document or the schema that follows it)

- RLS policies themselves, and the grants that go with them (§ warning
  banner — schema is never applied alone).
- The atomic RPC that turns an admin-approved `manual_payments` row into
  an active `subscriptions` row.
- Atomic `max_uses` enforcement for coupon redemption (needs a
  count-then-insert transaction, not a static constraint).
- The actual `daily_reminder` scheduler/cron.
- **Rate limiting on guest-submittable public forms** (`enrollments`,
  `trial_requests`, `subscribers`) — an earlier decision was "Postgres
  counters, no new external service," but `rate_limit_counters` is
  itself on this document's DROP list (§12, cut in the Product Data
  Scope Reset). That conflict was surfaced, not silently resolved; the
  user's explicit call was to leave rate limiting deferred for this
  pass rather than pick a mechanism now. The RLS matrix's `anon INSERT`
  policies on these 3 tables carry no rate-limit enforcement as a
  result — a real gap until this is designed.
- Exact PayPal integration confirmation (Orders API one-time vs. any
  future recurring-subscriptions API).
- ~~Confirming the exact `currency`/`language` allowlists against real
  product requirements~~ — **done** (baseline remediation): re-verified
  directly against the live app. `currency_code` is `EUR` only (§4);
  `notification_preferences.language` allows `en`/`ar`/`it`/`es`/`de`/`fr`
  (§5). The original narrowing (`USD`, `en`/`ar`) rested on weak/
  mistaken evidence, corrected once a review caught it.

## Status

- `scripts/post-merge.sh`'s risky `pnpm --filter db push` line: removed,
  committed on `main` (`3c10a40`).
- This document (v3-final, self-contained revision, later corrected by
  baseline remediation — see the currency/language/refund/claim-event
  notes throughout): committed on `docs/product-scope-closure-v3`.
- The 20-table schema, its versioned migrations, and a local Docker
  Postgres test suite (62 real-SQL assertions, including 2 genuine
  concurrency tests) exist as subsequent commits on this same branch.
  RLS is now implemented and locally tested too
  (`lib/db/drizzle/0002_rls.sql`, `docs/rls-matrix.md`, 25/25 real
  role-switching assertions) — not yet applied anywhere near the real
  project.
- Nothing applied, dropped, or pushed on the real Supabase project at any
  point. No `git push`. `ae47640` still sits unmodified in history,
  documented as superseded.
