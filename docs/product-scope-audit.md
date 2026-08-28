# Product Data Scope Reset + Supabase Minimal Baseline Audit

**Date:** 2026-08-28 (v3)
**Branch:** `docs/product-scope-closure-v3` (off `cf24eb7` on `main`) —
kept off `main` deliberately per this revision's own instruction, instead
of continuing to commit documentation-only changes directly to `main`.
**Scope of evidence:** `artifacts/al-rahma-academy` and `artifacts/api-server` only.
`.migration-backup/` (the old MongoDB/Express backend) is historical
reference only.

**Revision note:** this is v3, replacing v2. v2 answered the 3 original
open questions; the product owner then added a further round of
corrections (financial-ledger shape, provider-event idempotency, audit
log, account/checkout policy, enrollment field accuracy). **v1's 13-table
and v2's 18-table proposals are both superseded — do not build against
either. This document (v3, 20 tables) is the only current baseline.**

## ⚠️ What approving this document does and does not authorize

**Approving this document approves a *design* only.** It does **not**
authorize:
- dropping, altering, or pushing anything to the real Supabase project,
- running `drizzle-kit push` (not used as a deployment mechanism at all
  going forward — see §11),
- any `git push`, merge, or deploy.

Every one of those is a **separate, explicit permission**, asked for at
the time it's actually about to happen — never implied by "the design was
approved." See §12 ("Status") for exactly what has and hasn't happened so
far, and §13 ("Next Step") for what happens after this document is
approved, which is *authoring migration files locally*, nothing remote.

## 1–2. Feature Inventory / API-Data Flow

Unchanged from v1/v2 — see git history of this file if the full narrative
is needed again. Nothing about the underlying evidence changed in this
revision, only the schema/policy conclusions drawn from it.

## 3. Locked Product Decisions (carried over from v2, still in force)

Accounts are `user`/`admin` only, `plans` is admin-managed pricing (server
verifies against the provider's price ID, never trusts a client-sent
amount), Stripe is a recurring monthly subscription, `notifications` is
back in with an LMS-free type set, admin scope is the fixed 12-area list
from v2 (Overview/Users/Enrollments/Trials/Plans/Subscriptions/Payments/
Coupons/Blog/Testimonials/Newsletter/Notifications), `testimonials` is
admin-curated only. All unchanged by v3 — see v2 (prior commit) for the
full reasoning on each if needed.

## 4. New Policy Corrections (v3)

1. **Account required to pay, not to inquire.** Free-trial requests and
   the enrollment/lead form can be submitted **without** an account
   (matches today's actual `Enroll.jsx`/`Trial.jsx` behavior — no login
   gate on either). Starting any **paid** checkout (Stripe, PayPal, or
   manual-payment submission) requires being logged in as a `user`.
   Consequently `subscriptions.user_id` and `invoices.user_id` are **NOT
   NULL** (payments also — see §6). No account is ever silently created
   from an email address inside a webhook handler — an account only ever
   comes from a real Supabase Auth signup. Public signup always creates
   `role='user'`; `admin` is never assigned from client metadata, signup,
   or a webhook — only via the out-of-band process already documented in
   v2 §5.
2. **`enrollments` corrected to match the real form**, not a generic
   guess: `times` (jsonb/array — availability), `subjects` (jsonb/array),
   `preferred_teacher_key` (a stable identifier for the *static* teacher
   directory entry the lead picked — **not** a foreign key to `profiles`,
   since `Teachers.jsx`'s directory is explicitly static/fictional
   marketing content with no real account behind it, confirmed in v1 §1),
   `preferred_teacher_name` (a snapshot string, so the lead record still
   reads sensibly even if the static directory entry is later renamed or
   removed), `requested_plan_slug` (a snapshot of the plan the lead
   selected — text, not a live FK, so it survives a plan being renamed or
   retired). **Caveat, stated plainly rather than guessed past:** the
   exact field list above is informed by the v1 evidence pass (which
   confirmed `EnrollWizard`/`Enroll.jsx` collect teacher/subjects/level/
   age/plan-shaped data) but has not been re-verified field-by-field
   against `Enroll.jsx`'s current literal prop/state names — that
   verification happens when the migration file is actually authored
   (§13), not asserted here with false precision. If the product decision
   later is to remove teacher selection from the UI entirely, that is a
   **separate UI decision** to make explicitly — this schema does not
   silently drop the already-existing lead data shape in anticipation of
   it.

## 5. Financial Model Correction (v3) — `payments` as an immutable ledger

`payments` is redesigned from "one row per transaction, mutable" to an
**append-only financial ledger**:
- `kind` enum(`charge`, `refund`) — a refund is its own row, not a status
  flip on the original charge.
- `parent_payment_id` (nullable, self-referencing → `payments.id`) links a
  refund row back to the charge it refunds. Multiple/partial refunds are
  supported (several refund rows can point at the same parent charge; the
  sum of refunded amounts is a derived value, not a stored one).
- Money is stored as **`amount_minor` (integer, minor currency units —
  cents)**, never a bare float/ambiguous numeric.
- **Snapshot fields at time of payment** — `plan_slug_snapshot`,
  `amount_minor_snapshot`, `currency_snapshot`, `provider_price_id_snapshot`
  — captured once, at write time, from whatever `plans` looked like *then*.
  This is what makes historical payments/invoices immune to a later plan
  price edit (per §3's plan-versioning rule: a Stripe price is never
  edited in place, only superseded — the snapshot is the local mirror of
  that discipline).
- **No full raw gateway payload stored on `payments`.** Full webhook
  payloads live only in `provider_events` (§6), and even there are
  redacted/hashed, not stored verbatim — `payments` gets a small
  `gateway_metadata` jsonb restricted to an explicit allowlist of
  non-sensitive fields (e.g. payment method brand/last4-masked, receipt
  URL — never full card data, never a customer's full billing address
  unless a real feature needs it). The exact allowlist and a retention/
  purge policy for `gateway_metadata` is written out as code comments
  when the migration is authored (§13), not left implicit.

## 6. New Table: `provider_events` — the real idempotency ledger

Every inbound Stripe/PayPal webhook event is recorded here **before**
being acted on — this is the idempotency boundary, not
`payments.gateway_event_id` (v2's draft conflated the two; corrected now):
`provider`, `provider_event_id`, `event_type`, `payload_hash` (integrity/
dedup check) plus a small redacted `payload_summary` jsonb (never the full
raw payload with secrets), `received_at`, `processed_at` (nullable until
handled), `processing_status` enum(`pending`,`processed`,`failed`,
`ignored`), `error_code` (nullable). **`unique(provider,
provider_event_id)`** is the hard idempotency guarantee — a duplicate
webhook delivery is rejected at the DB level before any business logic
runs, not just de-duplicated by application code.

## 7. Provider Behavior, Stated Explicitly (v3)

- **Stripe**: recurring monthly subscription. Webhooks (verified via
  `provider_events`) are the sole source of truth for subscription state —
  the client never self-reports "I'm subscribed now."
- **PayPal (current integration)**: Orders API — a **single payment**
  that grants a fixed access period, **not** a recurring subscription.
  `subscriptions` still gets a row for a PayPal grant (so "does this user
  currently have access" is one query regardless of provider), but its
  `cancel_at_period_end`/`canceled_at` fields don't meaningfully apply —
  it just expires at `current_period_end` unless a new payment extends it.
  If a real PayPal *subscriptions* API integration replaces this later,
  that's a distinct, separately-designed path, not assumed here.
- **Manual payment**: same fixed-period-grant shape as PayPal — one
  period, reviewed by admin. Activating the `subscriptions` row happens
  **only** via an atomic RPC after admin approval (never an implicit side
  effect of `manual_payments.status` changing) — the RPC's exact shape is
  an RLS/function-design detail for §13's next stage, not this document.
- `subscriptions` therefore intentionally serves two different real
  shapes (Stripe's true auto-renewing subscription vs. PayPal/manual's
  fixed-period grant) without claiming the latter two auto-renew.

## 8. New Table: `admin_audit_log`

Simple, append-only: `actor_admin_id` (→`profiles`), `action`,
`resource_type`, `resource_id`, `before`/`after` (jsonb, secrets stripped
— same discipline as the old backend's audit log, per the earlier Render-
backend audit), `created_at`. Records: admin-role promotion, manual-
payment approval/rejection, refunds, plan changes, content changes
(blog/testimonials), announcements. **No `UPDATE`/`DELETE` from the
application** — enforced at the RLS layer in §13's next stage; this
document just fixes the intent so the RLS design isn't inventing the rule
later.

## 9. `notifications` Corrections (v3)

Adds `scheduled_for` (nullable timestamp — lets `daily_reminder` rows be
created ahead of their send time) and `dedupe_key` (text, nullable) with
a `unique(user_id, dedupe_key)` constraint (only enforced when
`dedupe_key` is not null) — this is what actually prevents a double-fired
daily-reminder job from creating two rows for the same user/day, at the
DB level rather than hoping application logic catches it. Read/mark-read
stays user-scoped to their own rows; creation stays system/admin-only.
In-app only, as already decided in v2 — no push-token table.

## 10. `plans` Corrections (v3)

`amount_minor` (integer, not a bare `amount`), `currency` constrained to
an explicit ISO allowlist (exact list — e.g. USD/EUR/EGP/GBP — confirmed
when the migration is authored, not invented here), `stripe_price_id`/
`paypal_plan_id` unique **when not null** (so multiple plans can share a
null value during setup without a false unique-conflict, but no two real
provider price IDs ever collide). A plan price change is a new row/new
provider price + deactivating the old one — already stated in v2,
reinforced here by §5's snapshot fields so historical `payments`/
`invoices` are never reinterpreted through a plan's current price.
**Coupons must state their own discount duration explicitly** — a new
`discount_scope` enum(`first_payment_only`, `fixed_duration`, `forever`)
on `coupons`, plus a `discount_duration_cycles` (nullable integer, used
only when `discount_scope = 'fixed_duration'`) — nothing assumes a coupon
discount silently applies forever on a recurring subscription.

## 11. Migration Policy (v3)

**`drizzle-kit push` is not used as a deployment mechanism going
forward.** It applies a computed diff directly with no reviewable
artifact — fine for Stage 1's throwaway verification, wrong for anything
meant to be a durable, auditable change. From here on, schema changes are
expressed as **versioned SQL migration files** (e.g. via `drizzle-kit
generate`, reviewed as a diff before ever being applied to any database,
real or otherwise). This document does not apply anything — §13 covers
what happens next, entirely locally.

## 12. Required vs Obsolete Tables — Final Recount (v3)

**KEEP — 14 tables** (same 14 as v2, shapes corrected per §5–§10 above):
`profiles`, `quran_bookmarks`, `quran_reading_progress`,
`quran_memorization_stats`, `enrollments` (corrected, §4.2), `payments`
(redesigned as a ledger, §5), `manual_payments`, `invoices` (`user_id` now
`NOT NULL`, §4.1), `coupons` (discount-scope fields added, §10),
`coupon_redemptions`, `trial_requests`, `subscribers`, `blogs`,
`notifications` (scheduling/dedupe fields added, §9).

**NEW — 6 tables**: `plans`, `subscriptions` (`user_id` now `NOT NULL`,
§4.1), `notification_preferences`, `testimonials`, `provider_events`
(§6), `admin_audit_log` (§8).

**DROP — 20 tables** (unchanged from v2): `profile_children`,
`admin_lockouts`, `courses`, `course_progress`, `certificates`,
`student_records`, `live_classes`, `hifz_progress`, `referrals`,
`messages`, `reviews` (superseded by `testimonials`), `posts`,
`post_likes`, `comments`, `wishlist_items`, `tutor_conversations`
(deferred), `system_config`, `system_audit_log`, `rate_limit_counters`,
`contact_messages`.

14 KEEP + 20 DROP = 34 ✓ (every table `ae47640` pushed is accounted for).

**Final schema = 14 + 6 = 20 tables.** This count is the `public` schema
only — it does **not** include `auth.users` (Supabase-managed, never
created or counted as one of ours).

## 13. Next Step (design-local only — see the warning banner at the top)

Once this v3 document is approved as a **design**:
1. Author the 20-table schema as versioned migration files (not
   `drizzle-kit push`) — new/replaced `lib/db/src/schema/*.ts` plus
   generated SQL migration file(s).
2. Write local tests for the schema (constraint checks, the
   `provider_events` idempotency unique constraint, the `notifications`
   dedupe constraint, etc.) — run locally, nothing remote.
3. **Stop and ask separately** before any of: pushing/applying a migration
   to the real Supabase project, dropping the old 34 tables there, `git
   push`, merge, or deploy. None of those follow automatically from
   finishing steps 1–2.
4. RLS design is its own later stage, after the schema itself is settled
   and (separately) actually applied.

## Status

- `scripts/post-merge.sh`'s `pnpm --filter db push` line: removed,
  committed on `main` (`3c10a40`).
- v1/v2 of this document: committed on `main` (`3c10a40`, `cf24eb7`).
- **v3 (this revision) is being committed on the new branch
  `docs/product-scope-closure-v3`, not `main`**, per this revision's own
  instruction.
- No SQL, no migration file, no RLS written yet. Nothing applied, dropped,
  or pushed on the real Supabase project. No `git push`. `ae47640` still
  sits unmodified in history, documented as superseded since v2.
