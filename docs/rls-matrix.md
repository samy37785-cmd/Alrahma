# RLS Matrix — Implemented (`lib/db/drizzle/0002_rls.sql` through `0009_refund_integrity.sql`)

> **This document describes real, tested `CREATE POLICY`/`GRANT`/trigger
> SQL.** Round 3 (this revision) rewrites it against the actual final
> SQL after a third review found: (A) `0002`'s closing `GRANT` block only
> ever `REVOKE`d `FROM PUBLIC`, which never touches a grant made
> directly to a named role — a real Supabase project carrying prior
> drift would not actually be cleaned up by `0002`/`0003` alone; (B) the
> webhook lease had no fencing — a worker whose lease already expired
> and was reclaimed could still close out its stale claim later; (C)
> `subscriptions` was still raw-`UPDATE`-able by an AAL2 admin, any
> column, no transition validation, no audit; (D) invoice issuance
> didn't check amount/discount/plan/status against the linked payment,
> and nothing stopped more than one invoice per payment; (E) `plans` was
> still raw-`UPDATE`-able despite the schema's own "price is never
> edited in place" design, and the flat `unique(slug)` made real
> versioning structurally impossible; (F) the refund RPC didn't reject a
> zero/negative amount, and its name implied a real gateway call it
> never made; (G) the test suite's `expectReject()` accepted *any* error
> as proof of correct denial, unable to distinguish a `GRANT`-layer
> denial from an RLS denial from a trigger from a constraint.
>
> **Tested, not just written**: `lib/db/test/rls.local.test.mjs` (67
> assertions) + `lib/db/test/rls-full-matrix.local.test.mjs` (58
> assertions — the systematic per-table sweep) + `lib/db/test/acl.local.
> test.mjs` (18 assertions — direct `has_table_privilege`/`has_column_
> privilege`/`has_function_privilege` checks against the final grant
> matrix, not inferred from a caught error) + `lib/db/test/schema.local.
> test.mjs` (66 assertions) + `lib/db/test/upgrade-scenario.local.
> test.mjs` (9 assertions — the two-phase legacy-privilege-drift
> scenario Section A's fix specifically depends on) = **218 real-SQL
> assertions**, all passing against a throwaway local Docker Postgres,
> using real `SET ROLE`/session-JWT-claim role-switching (RLS is never
> enforced for a table owner or superuser, so a real test must switch to
> a non-owner role for a policy to matter at all). `expectReject()`
> (`lib/db/test/rls-helpers.mjs`) now accepts an optional `{ sqlState,
> messageIncludes }` matcher, used throughout this round's own new
> assertions and retrofitted onto every security-critical pre-existing
> one this round touched — a caught error alone is no longer treated as
> proof the *intended* layer is what stopped it. See `lib/db/test/
> last-run-output.txt` for the full captured run (both the clean-database
> scenario and the upgrade scenario).
>
> **Still NOT applied to the real Supabase project.** Per
> `docs/product-scope-audit.md` §13's Migration Policy and
> `docs/remote-reconciliation-proposal.md`: schema + RLS + grants apply
> together as one single, later, separately-permitted step.

## Roles

- **anon** — Supabase's unauthenticated client role.
- **user (owner)** — an authenticated `role='user'` account, acting on a
  row it owns (`user_id = auth.uid()` or `profiles.id = auth.uid()`).
- **user (other)** — the same account type, acting on a row it does
  **not** own.
- **admin (AAL1)** — an authenticated `role='admin'` account, no MFA
  step-up verified this session (`public.is_admin()`).
- **admin (AAL2)** — the same admin account after MFA step-up
  (`public.is_admin_aal2()`). Financial/PII-dense tables (`payments`,
  `manual_payments`, `invoices`, `provider_events`, `admin_audit_log`,
  `subscriptions`, `plans`) require AAL2 for `SELECT`, not just AAL1.
- **service_role** — Supabase's server-side key. `BYPASSRLS` skips every
  policy on this list, but **does not imply any base SQL privilege** —
  it still needs the `GRANT`s at the bottom of `0002_rls.sql`/
  `0004_privilege_reconciliation.sql`. Round 3 verified live, twice,
  that a blanket `service_role` table grant is genuinely NOT enough on
  its own for a table meant to be immutable (invoices) — a real,
  role-blind trigger is what actually closes that, not the grant
  structure (see note 9).

## Cell notation — 3 distinct failure modes, kept visibly separate

A denial can happen at **three different layers**, and Round 2 already
found conflating them was a real, misleading gap. Each cell is
`SELECT INSERT UPDATE DELETE`, in that fixed order:

- **`✓`** — actually succeeds: a `GRANT` exists AND a `CREATE POLICY`
  (or `service_role`'s `BYPASSRLS`) permits it. Real, tested.
- **`✗`** — the `GRANT` exists, but **RLS** is what blocks it: `SELECT`/
  `DELETE` silently return/affect **0 rows** (no error — the `USING`
  clause just excludes every target row); `INSERT`/`UPDATE` **raise a
  hard error** ("new row violates row-level security policy") because
  the row fails `WITH CHECK`. Which of the two happens is noted per row
  where it isn't obvious.
- **`⊘`** — denied at the **`GRANT` layer**, before RLS is ever
  evaluated: no base SQL privilege exists for that role/operation/table
  at all ("permission denied for table/function ..."). Round 3 verified
  this precisely, per cell, via `has_table_privilege()`/`has_function_
  privilege()` (`acl.local.test.mjs`) — not inferred from a caught
  error. One real correction this round made: `subscriptions`'
  authenticated-owner raw `INSERT` was previously *labeled* `⊘` in this
  doc's Round 2 text, but direct ACL verification found `authenticated`
  actually still held the `INSERT` grant the whole time (RLS — no
  matching policy — was the real, if accidental, reason it always
  failed). `0006_subscription_integrity.sql` explicitly revokes that
  leftover grant now, making the `⊘` label true for the first time,
  proven directly.
- **`(trigger)`** suffix — a real Postgres trigger blocks it regardless
  of role/grant/policy — the strongest guarantee, holds even for
  `service_role`. Round 3 added 3 new trigger-enforced immutability
  guarantees: `enforce_subscription_transition()`, `enforce_plan_
  immutability()`, `forbid_invoice_mutation()`.
- **`(RPC)`** suffix — no raw write path exists at all for this cell;
  the *only* real path is a named `SECURITY DEFINER` (or, where noted,
  plain-invoker) RPC. Noted per-row which RPC, and whether it actually
  admits this role/AAL — a function being *callable* (`EXECUTE`
  granted) is not the same as it *succeeding* for every caller or every
  input.
- **"(grant, unused by convention)"** — the `GRANT` genuinely permits
  it and no trigger blocks it, but no code path is expected to ever do
  this. Marked `✓` with this qualifier, not silently downgraded — the
  technical capability is real, only the *intent* is "don't." Round 3
  found and documents 2 real instances of this pattern for `plans`/
  `subscriptions` `DELETE` (note 4) — deliberately left as-is, matching
  the pre-existing convention already used for `manual_payments`/
  `coupon_redemptions`, not silently hardened beyond what this round's
  task actually asked for.

| # | Table | anon | user (owner) | user (other) | admin (AAL1) | admin (AAL2) | service_role |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | ⊘⊘⊘⊘ | ✓ ⊘ ⊘(RPC¹) ⊘ | ✗ ⊘ ⊘ ⊘ | ✓ ⊘ ⊘(RPC²) ⊘ | ✓ ⊘ ⊘(RPC²) ⊘ | ✓✓✓✓ |
| 2 | `quran_bookmarks` | ⊘⊘⊘⊘ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 3 | `quran_reading_progress` | ⊘⊘⊘⊘ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 4 | `quran_memorization_stats` | ⊘⊘⊘⊘ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 5 | `enrollments` | ⊘ ✓ ⊘ ⊘ | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✓ ✓ ✗ ✗ | ✓✓✓✓ | ✓✓✓✓ |
| 6 | `plans` | ✓³ ⊘ ⊘ ⊘ | ✓³ ⊘ ⊘ ⊘ | ✓³ ⊘ ⊘ ⊘ | ✓ ⊘ ⊘ ⊘ | ✓ ⊘(RPC⁴) ⊘(RPC⁴) ⊘ | ✓ ✓(RPC-path only) ✓(trigger⁴) ✓(convention⁴) |
| 7 | `subscriptions` | ⊘⊘⊘⊘ | ✓ ⊘ ⊘(RPC⁵) ⊘ | ✗ ⊘ ⊘ ⊘ | ✗ ⊘ ⊘ ⊘ | ✓ ⊘(RPC⁶) ⊘ ⊘ | ✓ ✓(RPC-path only) ✓(trigger⁷) ✓(convention) |
| 8 | `payments` | ⊘⊘⊘⊘ | ✓⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✓ ⊘(RPC⁸) ⊘ ⊘ | ✓ ✓ ✓(trigger⁹) ✗(trigger) |
| 9 | `provider_events` | ⊘⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✓⊘⊘⊘ | ✓ ✓ ✓¹⁰ ✓(convention) |
| 10 | `manual_payments` | ⊘⊘⊘⊘ | ✓✓⊘⊘ | ✗✓⊘⊘ | ✗✓⊘⊘ | ✓ ✓ ⊘(RPC¹¹) ⊘ | ✓✓✓(convention)✓(convention) |
| 11 | `invoices` | ⊘⊘⊘⊘ | ✓✗⊘⊘ | ✗✗⊘⊘ | ✗✗⊘⊘ | ✓ ⊘(RPC¹²) ⊘ ⊘ | ✓ ✓(trigger¹²) ✗(trigger¹³) ✗(trigger¹³) |
| 12 | `coupons` | ⊘⊘⊘⊘¹⁴ | ✗✗✗✗¹⁴ | ✗✗✗✗¹⁴ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 13 | `coupon_redemptions` | ⊘⊘⊘⊘ | ✓⊘⊘⊘ | ✗⊘⊘⊘ | ✓⊘⊘⊘ | ✓⊘⊘⊘ | ✓✓✓(convention)✓(convention) |
| 14 | `blogs` | ✓¹⁵⊘⊘⊘ | ✓¹⁵✗✗✗ | ✓¹⁵✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 15 | `testimonials` | ✓¹⁵⊘⊘⊘ | ✓¹⁵✗✗✗ | ✓¹⁵✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 16 | `trial_requests` | ⊘✓⊘⊘ | ✗✓✗✗ | ✗✓✗✗ | ✓✓✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 17 | `subscribers` | ⊘✓⊘⊘ | ✗✓✗✗ | ✗✓✗✗ | ✓✓✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 18 | `notifications` | ⊘⊘⊘⊘ | ✓✗⊘(RPC¹⁶)✓ | ✗✗⊘✗ | ✗✗⊘✗ | ✓✓⊘(RPC¹⁶)⊘¹⁷ | ✓✓✓✓ |
| 19 | `notification_preferences` | ⊘⊘⊘⊘ | ✓✓✓⊘ | ✗✗✗⊘ | ✓✗✗⊘ | ✓✗✗⊘ | ✓✓✓(convention)✓(convention) |
| 20 | `admin_audit_log` | ⊘⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✓ ⊘(RPC-internal) ⊘ ⊘ | ✓ ✓(convention) ✗(trigger) ✗(trigger) |

## Notes

1. `profiles` owner mutation is RPC-only: **no raw owner `UPDATE`
   policy exists at all** — `update_own_profile_name(text)`, a
   `SECURITY DEFINER` RPC touching only `name`, is the sole write path
   (tested: a raw owner `UPDATE` is denied at the **GRANT** layer —
   `authenticated` has no base `UPDATE` grant on `profiles` at all).
2. `profiles` admin mutation: **no raw admin `UPDATE`/`INSERT` policy
   exists either**, and neither does the base `GRANT`. `admin_set_role()`
   is the **only** way to change a `profiles` row, for either AAL level.
3. `plans` public `SELECT` is scoped to `active = true`; `anon`/
   non-admin `authenticated` both see the same active-only slice.
4. **`plans` — Round 3, Section E, fully rewritten.** The raw admin
   `INSERT`/`UPDATE` policies AND grants are BOTH gone now — even AAL2
   admin's raw `INSERT`/`UPDATE` is denied at the **GRANT** layer
   (verified: `has_table_privilege('authenticated', 'plans', 'UPDATE')`
   is `false`), a stronger, earlier denial than Round 2's "RLS lets AAL2
   through." 3 narrow RPCs replace it, all AAL2-gated and audited:
   `create_plan_version(p_old_plan_id, ...)` — `p_old_plan_id = NULL`
   creates a brand-new plan (new slug, version 1); a real old-plan-id
   locks it, requires it's currently `active`, deactivates it, and
   inserts the new row with the SAME slug at `version + 1` (a race
   between two concurrent calls produces exactly one winner, backstopped
   by `plans_slug_active_unique` — a real partial unique index, `WHERE
   active`, that REPLACES the old flat `unique(slug)`, which made true
   versioning under the same slug structurally impossible). `deactivate_
   plan(p_plan_id)` — sets `active = false` only. `admin_update_plan_
   display(p_plan_id, p_display_order)` — the one narrow "safe metadata"
   edit, `display_order` only. `enforce_plan_immutability()` (`BEFORE
   UPDATE`, no role exception) blocks changing `amount_minor`/
   `currency`/`stripe_product_id`/`stripe_price_id`/`paypal_plan_id`/
   `slug`/`version`/`name`/`billing_interval`/`sessions_per_week`/
   `sessions_per_month` on ANY existing row, for ANY reason — including
   `service_role` (tested: a direct `service_role` price change on a
   superseded row is rejected by the trigger, SQLSTATE `P0001`). Only
   `active`/`display_order`/`updated_at` stay genuinely mutable in
   place. `service_role`'s `DELETE` cell is `(convention)`: a real,
   pre-existing (Round 2) capability this round did NOT additionally
   close — `plans.id` is referenced by `payments`/`invoices`/
   `subscriptions` via `ON DELETE SET NULL`, so a raw `service_role`
   `DELETE` would silently orphan historical financial rows' `plan_id`;
   this is a real, honestly-documented, deliberately-deferred hardening
   gap (see "Deferred" below), not something Section E's task text
   asked this round to close.
5. **`subscriptions` owner mutation — Round 3, Section C.**
   `request_cancel_subscription(p_subscription_id)` is the only owner
   write path, and it is narrowly scoped: sets `cancel_at_period_end =
   true` only (real-world "takes effect at period end," not an
   immediate cancel) — raises if the caller doesn't own the row or it
   isn't in a cancelable state. No owner path exists to change any other
   column.
6. **`subscriptions` admin mutation — Round 3, Section C, closed
   entirely.** `subscriptions_update_admin_aal2` (the raw admin `UPDATE`
   policy AND its `GRANT`) is GONE — even an AAL2 admin's raw `UPDATE`
   is now denied at the **GRANT** layer (verified directly:
   `has_table_privilege('authenticated', 'subscriptions', 'UPDATE')` is
   `false`), closing the real bug this round found: an AAL2 admin could
   previously change **every column** on a subscriptions row directly —
   `user_id`, `provider`, `provider_customer_id`,
   `provider_subscription_id`, `status` — with no transition validation
   and no audit. A deliberate scope decision, stated explicitly here
   rather than silently narrowed: **no RPC lets an admin blindly update
   an existing subscription's lifecycle state.** `admin_activate_manual_
   subscription(p_manual_payment_id, p_plan_id, p_current_period_end)`
   (AAL2) only ever `INSERT`s a brand-new `provider='manual'` row from
   an approved, not-yet-activated `manual_payments` record (an atomic
   second claim on `status = 'approved' AND activated_at IS NULL`,
   making double-activation of the same record structurally
   impossible) — it never updates an existing subscriptions row.
   Subscription state changes come only from the owner's cancel request
   or the provider's own webhook (`service_apply_subscription_update()`,
   `service_role`-only) — not from admin fiat. `enforce_subscription_
   transition()` (`BEFORE UPDATE`, no role exception) independently
   enforces the real state graph regardless of caller: `user_id`/
   `provider` immutable; `provider_customer_id`/`provider_subscription_
   id` may only go `NULL → value` once, never `value → a different
   value`; `status` only moves `active ↔ past_due`, or either →
   `canceled`/`expired` (terminal, no transition out); `canceled_at` set
   iff `status = 'canceled'`; `cancel_at_period_end` only `true` while
   `active`/`past_due`. Deliberately does NOT enforce period-
   monotonicity (no reliable rule found for a legitimate webhook
   resync/proration case) — a real, named, deferred scope boundary (see
   "Deferred" below).
7. `subscriptions` `service_role` `UPDATE`: the real path is `service_
   apply_subscription_update(...)` (`service_role`-only — `EXECUTE`
   verified absent for `authenticated` via `has_function_privilege`),
   which upserts a Stripe recurring subscription via `ON CONFLICT
   (provider_subscription_id) ... DO UPDATE`. Deliberately NOT `SECURITY
   DEFINER` — `service_role` already holds the base table `GRANT`
   (0004) and `BYPASSRLS`, so no privilege escalation is needed; this
   also sidesteps a real Postgres gotcha verified live while building
   this migration — `current_user` inside a `SECURITY DEFINER` function
   reflects the FUNCTION OWNER, not the caller, for the function's
   entire duration, so a naive `current_user = 'service_role'` check
   inside a `SECURITY DEFINER` function would silently never be true.
   `enforce_subscription_transition()` (note 6) still fully applies to
   this path — real invariant enforcement, not an RLS-bypass escape
   hatch. `DELETE` is `(convention)` — same shape/reasoning as `plans`
   note 4 (real capability, not additionally closed by this round,
   pre-existing since Round 2).
8. `payments` admin AAL2 `INSERT`: **no raw policy** —
   `admin_record_refund(p_charge_id, p_amount_minor, p_gateway_refund_
   id)` (Round 3, Section F — **renamed** from `admin_issue_refund`,
   confirmed zero real callers anywhere in the tracked/untracked repo
   before the rename) is the only `INSERT` path for anyone but
   `service_role`, still independently governed by `validate_refund_
   insert()` (locked parent row, succeeded-only, amount cap, matching
   user/currency/gateway) — and now ALSO rejects `amount_minor <= 0`
   (Round 3: `NULL`/`0`/negative all tested, at both the RPC layer and
   the trigger layer directly, the latter even via a raw `service_role`
   insert bypassing the RPC entirely). **Honest scope note**: this
   function does NOT call Stripe/PayPal — it only records, in this
   ledger, that a refund has happened or is being tracked; the real
   gateway-side refund call is out of scope for this round, and the
   rename exists specifically so the function's name stops implying
   otherwise. `p_gateway_refund_id`, when given, reuses the existing
   `gateway_payment_id` column — the pre-existing `unique(gateway,
   gateway_payment_id)` index then gives a real, free guarantee against
   recording the same gateway-side refund twice.
9. `payments` service_role `UPDATE`: `GRANT` present (unrestricted), but
   `enforce_payment_status_transition()` still governs it — allowed only
   while a row is `pending`; `succeeded`/`failed` rows reject it
   regardless of role.
10. `provider_events` service_role `UPDATE` — **Round 3, Section B,
    completely redesigned (fenced lease).** The real bug Round 2's lease
    left open: a worker whose lease already expired and was reclaimed by
    a second worker could still later call `complete_provider_event()`
    successfully, since it only ever checked `id` + `status`, silently
    closing out the new worker's still-in-flight claim. Fix: an explicit
    fencing token. `claim_provider_event(p_id)` (same signature) now
    mints a fresh random `claim_token` on every successful claim
    (including a reclaim-then-reclaim), sets an explicit `lease_
    expires_at` (fixed 5-minute constant), and increments `attempt_
    count`. `complete_provider_event(p_id, p_claim_token, p_result,
    p_error_code)` — **signature changed**, now requires the CURRENT
    token: a stale worker's old token matches zero rows (a silent no-op,
    never overwrites the real owner's outcome — tested via a real
    claim→expire→reclaim→stale-completion→real-completion sequence).
    `reclaim_stale_provider_events(p_stale_after interval default '0
    seconds')` matches on `lease_expires_at` (not `claimed_at` any
    more), rejects a negative interval outright, and treats a `NULL`
    lease as stale (the safety net for any pre-Round-3 row — a
    migration-embedded self-heal `UPDATE` resets every such row to
    `pending` as part of applying `0005` itself; proven live against a
    real injected legacy row in `upgrade-scenario.local.test.mjs`).
    **Honest scope statement, stated explicitly per the task's ask**:
    this is DB-level fencing — it guarantees at most one worker's
    `complete_provider_event()` call can ever succeed per claim
    (at-least-once delivery with a safe single-current-owner guarantee).
    It does **not**, by itself, make an external side effect (a real
    gateway call, an email send) exactly-once — a worker whose lease is
    stolen mid-work may still have already performed that side effect
    even though its later completion call is rejected. True business-
    level idempotency needs the worker's own mutation keyed on
    `provider_event_id` (or, for the payment-recording side effect
    specifically, `payments`' own `unique(gateway, gateway_payment_id)`
    index already provides exactly that). **Deferred, named explicitly,
    not silently implied solved**: a bounded-retry policy (e.g. "give up
    and flip to `failed` after N attempts") — `attempt_count` is tracked
    but nothing acts on it; no product signal exists for what N should
    be or what "give up" should mean for a real payment webhook.
11. `manual_payments` admin AAL2 `UPDATE`: **no raw policy** —
    `admin_review_manual_payment()` is the only review path (`status`
    `pending → approved`/`rejected`). Activation of the corresponding
    subscription — the piece this table's own doc comment used to flag
    as deferred — is now built: `admin_activate_manual_subscription()`
    (subscriptions note 6), a SEPARATE atomic claim on `status =
    'approved' AND activated_at IS NULL`.
12. **`invoices` — Round 3, Section D, fully rewritten.** `INSERT` is now
    RPC-only: the raw admin `INSERT` policy AND grant are BOTH gone
    (verified: `has_table_privilege('authenticated', 'invoices',
    'INSERT')` is `false`). `issue_invoice_from_payment(p_payment_id)`
    is the ONLY real issuance path, callable by an AAL2 admin OR
    `service_role` (`is_admin_aal2() OR current_setting('role', true) =
    'service_role'` — note the DIFFERENT mechanism than subscriptions
    note 7: this function genuinely needs `SECURITY DEFINER` for the
    admin branch, and `current_user` is unusable there since `SECURITY
    DEFINER` masks it to the function owner; `current_setting('role',
    true)` was verified live to survive that boundary correctly, unlike
    `current_user`/`session_user`). Locks the payment row (`FOR UPDATE`),
    requires `kind = 'charge' AND status = 'succeeded'` (a pending,
    failed, or refund-kind payment is rejected — tested, all 3),
    derives EVERY financial field from the locked payment row — never
    accepts amount/currency/discount/plan-name from the caller.
    Idempotent (`ON CONFLICT (payment_id) DO NOTHING` + a fallback
    `SELECT`, proven safe under REAL 2-connection concurrency, not just
    sequential calls — both racing calls return the identical invoice
    id, and exactly one row exists). `invoices_payment_id_unique` (a
    real unique index) is the DB-level backstop: one invoice per
    payment, the decided policy — no credit-note/multiple-documents
    model exists in this schema. `payment_id` is now `NOT NULL` +
    `ON DELETE RESTRICT` (was nullable/`SET NULL`) — a receipt can never
    silently lose the charge it's a receipt for. `validate_invoice_
    insert()` (`0001`, amended) now ALSO checks
    `amount_minor_snapshot`/`discount_minor_snapshot`/`plan_id`/`status`
    against the linked payment (Round 2 deliberately left these
    unchecked pending exactly the derivation formula this round's RPC
    now establishes) — a real defensive backstop even against a
    hypothetical direct `service_role` insert (tested: a raw
    `service_role` insert with a mismatched amount is rejected by the
    trigger, not just discouraged by the RPC).
13. **`invoices` `UPDATE`/`DELETE` for `service_role` — a real gap Round
    3 found and closed.** `service_role` DOES hold the base `UPDATE`/
    `DELETE` `GRANT` (0004's blanket, never-revoked-for-service_role
    grant) and `BYPASSRLS` — direct verification while building this
    migration found NOTHING actually stopped a raw `service_role`
    `UPDATE`/`DELETE` on an already-issued invoice; the old `invoices_
    set_updated_at` trigger only bumped `updated_at`, it didn't block
    the mutation itself. `forbid_invoice_mutation()` (`BEFORE UPDATE OR
    DELETE`, no role exception — mirrors `forbid_audit_log_mutation()`'s
    exact pattern) closes this for real, for every role, tested directly
    against `service_role` (SQLSTATE `P0001`, not merely the `42501`
    that already covered `authenticated`). `invoices_set_updated_at` is
    dropped as an explicit consequence — a trigger whose only job is
    bumping `updated_at` on `UPDATE` is genuinely dead code once
    `UPDATE` can never succeed; this migration also removes the stale
    Round-1-era doc comment that used to claim `status` mutates (e.g.
    "pending → paid/cancelled") — that was never actually true once the
    immutable-receipt policy set shipped, and the schema/doc now state
    the one real decision consistently.
14. `coupons` has no `anon`/non-admin `authenticated` `SELECT` `GRANT`/
    policy at all — code validation at checkout is intended to go
    through a server-side RPC (deferred), never a raw client
    `SELECT * FROM coupons WHERE code = ...`.
15. `blogs`/`testimonials` public `SELECT` is scoped to `published =
    true`.
16. `notifications` owner mutation is RPC-only (`mark_notification_
    read()`) — but the RPC itself is strictly self-scoped, so an AAL2
    admin calling it on another user's notification also affects 0 rows.
17. `notifications` admin AAL2 `DELETE`: no admin delete policy exists —
    only the owner's own dismiss path.

## Fencing contract — provider_events (Round 3, Section B)

Stated here explicitly since it's function-internal behavior the
per-table notation above can't fully capture:

- **Fencing identity**: a random `claim_token uuid`, minted fresh on
  every successful claim (initial or reclaim). Chosen over a
  monotonically-incrementing generation counter — a UUID needs no
  separate sequence/counter column, can't collide across concurrent
  claims without coordination, and completion only ever checks
  CURRENT-token equality, never relative ordering (the generation
  counter's one real advantage), so the extra complexity buys nothing
  here.
- **Guarantee**: at most one worker's `complete_provider_event()` call
  can ever succeed per claim (single-current-owner). A stale completion
  call is a silent no-op (0 rows), never an error, never overwrites
  `processed_at`/`error_code`.
- **NOT guaranteed**: exactly-once delivery of the underlying side
  effect. This is at-least-once delivery with a safe single-owner
  completion — real business-level idempotency for the side effect
  itself still needs to be keyed on `provider_event_id` (or, for
  payment recording specifically, `payments`' own unique gateway-id
  index).
- **On reclaim**: `processing_status`/`claimed_at`/`lease_expires_at`/
  `claim_token` all reset; `processed_at`/`error_code` are untouched
  (only ever set by a successful completion, never by a reclaim).
  `attempt_count` is NOT reset by a reclaim (only grows via a claim).
- **Deferred, explicitly**: no bounded-retry/give-up policy exists.

## Subscription transition matrix (Round 3, Section C)

| From ↓ / To → | active | past_due | canceled | expired |
|---|---|---|---|---|
| `active` | — | ✓ | ✓ | ✓ |
| `past_due` | ✓ | — | ✓ | ✓ |
| `canceled` | ✗ (terminal) | ✗ | — | ✗ |
| `expired` | ✗ (terminal) | ✗ | ✗ | — |

Enforced by `enforce_subscription_transition()` for every `UPDATE`,
every role, no exception. `user_id`/`provider` are immutable forever.
`provider_customer_id`/`provider_subscription_id` may go `NULL → value`
once, never `value → a different value`. Period-monotonicity is NOT
enforced (deferred — see note 6 above).

## Invoice issuance contract (Round 3, Section D)

An invoice is a receipt for exactly one succeeded charge. It is:
issued ONLY via `issue_invoice_from_payment(payment_id)`; NEVER issued
from a `refund`-kind payment or a `pending`/`failed` charge; financial
fields ALWAYS derived from the linked payment, NEVER trusted from the
caller; idempotent per payment (`invoices_payment_id_unique`); immutable
once issued, for every role, enforced by trigger (note 13). No credit-
note/multiple-documents-per-payment model exists — a real product need
for one is a deliberate new design, not a side effect of loosening the
unique index.

## Plan versioning contract (Round 3, Section E)

A plan row's catalog-defining columns (`amount_minor`, `currency`,
`stripe_product_id`, `stripe_price_id`, `paypal_plan_id`, `slug`,
`version`, `name`, `billing_interval`, `sessions_per_week`,
`sessions_per_month`) are immutable once created, for every role,
enforced by trigger. A price/catalog change is always a NEW row
(`create_plan_version()`), never an edit — at most one `active = true`
row per `slug` at any time (`plans_slug_active_unique`, a real partial
unique index, the actual race backstop). `display_order`/`active` are
the only genuinely mutable-in-place columns, via `admin_update_plan_
display()`/`deactivate_plan()`/`create_plan_version()` respectively. The
public (`anon` and non-admin `authenticated`) only ever sees
`active = true` rows.

## Refund / provider-integration contract (Round 3, Section F)

`admin_record_refund()` (renamed from `admin_issue_refund` — confirmed
zero real callers before the rename) rejects `NULL`/`0`/negative
amounts at both the RPC layer and, independently, the trigger layer
(`validate_refund_insert()`, so even a raw `service_role` insert can't
bypass the `> 0` rule). It records a refund in this ledger; it does
**not** call any payment gateway. Ordering contract, stated explicitly
because there's no real gateway integration to order against yet: the
ledger row is written immediately on call, not gated on external
confirmation. `p_gateway_refund_id`, when supplied, gives a real,
already-existing unique-index guarantee against double-recording the
same gateway-side refund. **The actual gateway-side refund call remains
entirely deferred** — this is the honest, named state of that gap, not
a claim that it's solved.

## Round 1's 2 open follow-up items — resolved in Round 2

- `quran_bookmarks`/`quran_reading_progress`/`quran_memorization_stats`
  admin `DELETE`: closed (Round 2) — admin's `DELETE` cell is a flat `✗`
  for all 3 tables.
- `notifications` admin read: closed (Round 2) — AAL2 gets full read,
  AAL1 gets none.

## Deferred / explicitly out of scope

- **Rate limiting on guest-submittable public forms** (`enrollments`,
  `trial_requests`, `subscribers` anon `INSERT`): still explicitly
  deferred. **This is a BLOCKING pre-production gate, not a low-priority
  note** — acceptable to leave open only because this baseline has never
  been applied anywhere.
- **`plans`/`subscriptions` `service_role` `DELETE`** (notes 4, 7): a
  real, pre-existing (Round 2) capability, honestly documented as
  `(convention)`, not additionally closed this round — `plans.id`/
  `subscriptions.id` are referenced elsewhere via `ON DELETE SET NULL`,
  so a raw delete would silently orphan historical `plan_id`
  references. Real hardening (a `forbid_*_delete()`-style trigger,
  matching `payments`' own `forbid_payment_delete()`) is a legitimate
  follow-up, not built this round because Section E/C's task text
  scoped this round to price/status mutation, not deletion.
- **Provider events: bounded-retry / give-up policy** (fencing
  contract, above) — `attempt_count` is tracked, nothing acts on it.
- **Real gateway-side refund integration** (refund contract, above) —
  `admin_record_refund()` only records; it never calls a gateway.
- **Subscription period-monotonicity** (subscription transition matrix,
  above) — not enforced; no reliable rule found for a legitimate webhook
  resync/proration case.
- The manual-payment-activation RPC and the subscription-cancellation
  RPC are DONE this round (notes 5, 6, 11) — no longer deferred.
- The coupon-code-validation server-side RPC (note 14) — still deferred.
- Applying any of this to the real Supabase project — a separate,
  later, explicitly-permitted step (see the banner at the top of this
  file).

## Status

**Implemented and tested, Round 3.** `lib/db/drizzle/0004_privilege_
reconciliation.sql` through `0009_refund_integrity.sql` (6 new
migrations, `0000`-`0003` untouched), applied idempotently (twice, back
to back, across all 10 migration files) to a throwaway local Docker
Postgres, with **218 real-SQL assertions** passing across `schema.local.
test.mjs` (66), `rls.local.test.mjs` (67), `rls-full-matrix.local.
test.mjs` (58), `acl.local.test.mjs` (18, new this round — direct ACL
proof, not inference), and `upgrade-scenario.local.test.mjs` (9, new
this round — the real two-phase legacy-privilege-drift proof Section A
depends on). `tsc --noEmit` clean; `drizzle-kit generate` reports no
schema drift. All captured in `lib/db/test/last-run-output.txt`. **Not
applied to the real Supabase project** — that remains a separate,
later, explicitly-permitted step per `docs/product-scope-audit.md` §13
and `docs/remote-reconciliation-proposal.md`.
