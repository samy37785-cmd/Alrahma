# RLS Matrix — Draft (design only, not applied anywhere)

> **This is a design document, not a migration.** It contains no `CREATE
> POLICY` SQL and has not been run against any database, local or remote.
> Per `docs/product-scope-audit.md` §13's Migration Policy: the 20-table
> schema (`lib/db/drizzle/0000_init_20_table_baseline.sql`,
> `0001_functions_triggers.sql`) is NOT applied to the real Supabase
> project on its own. A real release bundles **schema + RLS policies +
> grants together as one single, later, separately-permitted step** —
> never a schema-first partial apply that leaves tables open with no row
> security. This matrix is the design work that later step will translate
> into actual `CREATE POLICY` statements, reviewed and tested (including
> against the local Docker Postgres this baseline already uses) before
> that step happens.

## Roles

- **anon** — Supabase's unauthenticated client role. Used for guest
  actions the account policy explicitly allows (enrollment/trial/
  newsletter submission, browsing public content/pricing).
- **user (owner)** — an authenticated `role='user'` account, acting on a
  row it owns (`user_id = auth.uid()` or `profiles.id = auth.uid()`).
- **user (other)** — the same account type, acting on a row it does
  **not** own.
- **admin (AAL1)** — an authenticated `role='admin'` account at
  Authentication Assurance Level 1 (password-only, no MFA verified this
  session). Read access for dashboards/support; no write access to
  anything sensitive.
- **admin (AAL2)** — the same admin account after MFA step-up
  (`auth.jwt() ->> 'aal' = 'aal2'`), per the earlier "Admin auth = full
  Supabase Auth convergence" decision. Required for every admin *write*
  that touches money, role, or published content.
- **service_role** — Supabase's server-side key (webhook handlers,
  scheduled jobs). Bypasses RLS by Postgres/Supabase design; listed here
  only to record which writes are expected to come from it, not because a
  policy governs it.

## Cell notation

Each cell is `SELECT INSERT UPDATE DELETE`, in that fixed order, each
either `✓` (would be allowed) or `✗` (would be denied). A row-marked `✗`
for DELETE that already has a **real, tested Postgres trigger** blocking
it today (not just a proposed future policy) is annotated
`✗ (trigger)` — that denial holds even for `service_role`, since the
trigger has no role exception. Everything else in this document is a
**proposal**, not yet enforced by anything.

| # | Table | anon | user (owner) | user (other) | admin (AAL1) | admin (AAL2) | service_role |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | ✗✗✗✗ | ✓ ✗ ✓¹ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✓ ✓ ✗ | ✓✓✓✓ |
| 2 | `quran_bookmarks` | ✗✗✗✗ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 3 | `quran_reading_progress` | ✗✗✗✗ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 4 | `quran_memorization_stats` | ✗✗✗✗ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 5 | `enrollments` | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✓✗✗✗ | ✓ ✗ ✓ ✓² | ✓✓✓✓ |
| 6 | `plans` | ✓³ ✗✗✗ | ✓³ ✗✗✗ | ✓³ ✗✗✗ | ✓✗✗✗ | ✓ ✓ ✓ ✗⁴ | ✓✓✓✓ |
| 7 | `subscriptions` | ✗✗✗✗ | ✓ ✗ ✗⁵ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✗ ✓⁶ ✗ | ✓ ✓ ✓ ✗ |
| 8 | `payments` | ✗✗✗✗ | ✓ ✗⁷ ✗ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✓⁸ ✗ ✗ (trigger) | ✓ ✓ ✓⁹ ✗ (trigger) |
| 9 | `provider_events` | ✗✗✗✗ | ✗✗✗✗ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓ ✓ ✓¹⁰ ✗ |
| 10 | `manual_payments` | ✗✗✗✗ | ✓ ✓ ✗ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✗ ✓¹¹ ✗ | ✓✓✓✗ |
| 11 | `invoices` | ✗✗✗✗ | ✓ ✗ ✗ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✓ ✗ ✗ | ✓ ✓ ✗ ✗ |
| 12 | `coupons` | ✗✗✗✗¹² | ✗✗✗✗¹² | ✗✗✗✗¹² | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 13 | `coupon_redemptions` | ✗✗✗✗ | ✓ ✗ ✗ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓ ✓ ✗ ✗ |
| 14 | `blogs` | ✓¹³ ✗✗✗ | ✓¹³ ✗✗✗ | ✓¹³ ✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 15 | `testimonials` | ✓¹³ ✗✗✗ | ✓¹³ ✗✗✗ | ✓¹³ ✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 16 | `trial_requests` | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✓✗✗✗ | ✓ ✗ ✓ ✓² | ✓✓✓✓ |
| 17 | `subscribers` | ✗ ✓ ✗¹⁴ ✗ | ✗ ✓ ✗¹⁴ ✗ | ✗ ✓ ✗¹⁴ ✗ | ✓✗✗✗ | ✓ ✗ ✓ ✓ | ✓✓✓✓ |
| 18 | `notifications` | ✗✗✗✗ | ✓ ✗ ✓¹⁵ ✓¹⁶ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✓¹⁷ ✗ ✗ | ✓✓✓✓ |
| 19 | `notification_preferences` | ✗✗✗✗ | ✓ ✓ ✓ ✗¹⁸ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✗ |
| 20 | `admin_audit_log` | ✗✗✗✗ | ✗✗✗✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✓ ✗ ✗ (trigger) | ✓ ✓ ✗ (trigger) ✗ (trigger) |

## Notes

1. `profiles` UPDATE by the owner: RLS is row-level, not column-level —
   a `USING (id = auth.uid())` policy alone would let a user set their
   own `role` to `'admin'` in the same UPDATE that changes their `name`.
   The actual release must pair this policy with either a `REVOKE
   UPDATE(role) FROM authenticated` column-privilege grant, or a `BEFORE
   UPDATE` trigger rejecting any `role` change from a non-`service_role`
   session — a real decision for the schema+RLS+grants release, not
   assumed solved by this row-level table.
2. `enrollments`/`trial_requests` admin DELETE: a deliberate exception to
   the "never hard-delete" discipline used for financial tables — these
   are lead-capture rows, not a ledger, and admin spam/GDPR cleanup is a
   reasonable real need. Still AAL2-gated.
3. `plans` public SELECT is scoped to `active = true` — inactive/retired
   plans stay admin/service_role-only, so a deactivated price is never
   shown at checkout even though the row is never deleted.
4. `plans` DELETE is `✗` for every role including AAL2 admin — the
   locked design (`plans.ts`'s doc comment) never hard-deletes a plan,
   only deactivates (`active = false`) and supersedes with a new row
   (`version`), so historical `payments`/`invoices` snapshots never point
   at a vanished plan.
5. `subscriptions` owner UPDATE is `✗`: a user-initiated cancellation
   goes through a server-side RPC (deferred, not built this pass — see
   §14 of the audit doc) that calls out to Stripe/PayPal and only then
   updates the row, rather than a client writing `status`/
   `cancel_at_period_end` directly.
6. `subscriptions` admin AAL2 UPDATE: manual overrides only (e.g.
   extending a manual-payment grant's `current_period_end`) — not a
   general-purpose edit surface.
7. `payments` owner INSERT is `✗`: every payments row is written by
   server-side code reacting to a gateway webhook or an admin-approved
   manual payment, never inserted directly by the paying client.
8. `payments` admin AAL2 INSERT: the only sanctioned way an admin
   "edits" a payment — issuing a new `kind='refund'` row. The `payments`
   table itself is otherwise not admin-writable (matches `payments.ts`'s
   already-real triggers: `enforce_payment_status_transition()`,
   `forbid_payment_delete()`).
9. `payments` service_role UPDATE is scoped by the same real
   `enforce_payment_status_transition()` trigger as everyone else —
   allowed only while a row is still `pending`; once
   `succeeded`/`failed` the trigger rejects it regardless of role.
10. `provider_events` service_role UPDATE is expected to go through
    `claim_provider_event()`, not a raw `UPDATE` — RLS would still need
    to permit it structurally, but the intended call path is the
    function.
11. `manual_payments` admin AAL2 UPDATE: the pending→approved/rejected
    review decision. The real activation of a `subscriptions` row on
    approval is a separately-designed atomic RPC (deferred — audit doc
    §14), not a raw UPDATE either.
12. `coupons` has no anon/user SELECT policy at all — code validation at
    checkout is intended to go through a server-side check (RPC/edge
    function), not a raw client-side `SELECT * FROM coupons WHERE code =
    ...`, so the full active-coupon list is never queryable by a client.
13. `blogs`/`testimonials` public SELECT is scoped to `published = true`
    — drafts and unpublished testimonials stay admin/service_role-only.
14. `subscribers` UPDATE (e.g. unsubscribing) is `✗` for anon/user — the
    intended flow is a signed-token link handled server-side
    (service_role), not a raw client UPDATE by anyone who guesses a row.
15. `notifications` owner UPDATE is meant to cover exactly one thing —
    flipping `read`. Same column-level caveat as `profiles.role` (note
    1): the real release should restrict this to the `read` column only
    (grant or RPC), not open every column (`title`, `body`, `meta`, ...)
    to the owner.
16. `notifications` owner DELETE: read as "dismiss" — allowed on a row
    the user already owns, no admin approval needed for a user clearing
    their own notification list.
17. `notifications` admin AAL2 INSERT: manually creating an
    `admin_announcement` row. Scheduled `daily_reminder` rows are
    service_role (the cron/scheduler, itself deferred — audit doc §5).
18. `notification_preferences` owner DELETE is `✗`: the row is a 1:1
    settings singleton keyed by `user_id`; "reset" means updating fields
    back to defaults, not deleting and recreating the row.

## Deferred / explicitly out of scope for this matrix

- Actual `CREATE POLICY` SQL, and the accompanying column-level `GRANT`/
  `REVOKE` statements needed for notes 1 and 15.
- The AAL2 step-up check's exact SQL form
  (`auth.jwt() ->> 'aal' = 'aal2'` vs. a Supabase helper) — needs
  confirming against whatever Supabase Auth version the real project is
  actually running.
- The manual-payment-approval RPC, the subscription-cancellation RPC, and
  the coupon-code-validation RPC referenced in the notes above (all
  already listed as deferred in `docs/product-scope-audit.md` §14).
- Testing this matrix's eventual `CREATE POLICY` SQL — planned against
  the same local Docker Postgres this baseline's schema was already
  tested on, before any remote application.

## Status

Design draft only. Not applied to the local Docker Postgres test
database, and not applied to the real Supabase project. The real release
is schema + RLS + grants together, as one single, later, separately-
permitted step (see the warning banner at the top of this file and
`docs/product-scope-audit.md` §13).
