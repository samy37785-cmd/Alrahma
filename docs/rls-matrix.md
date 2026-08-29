# RLS Matrix — Implemented (`lib/db/drizzle/0002_rls.sql`, `0003_provider_events_lease.sql`)

> **This document describes real, tested `CREATE POLICY`/`GRANT` SQL.**
> Round 2 (this revision) rewrites it against the actual policies AND
> grants after a second review found several "RPC-audited" mutations
> were never RPC-*only* — a parallel raw policy let the same admin
> session bypass the RPC entirely. Every cell below was re-derived by
> reading `0002_rls.sql`/`0003_provider_events_lease.sql` line by line —
> **including the `GRANT` block**, not just `CREATE POLICY` statements
> (Round 1's version conflated "blocked by a real mechanism" with "just
> a convention nothing calls" — see the notation below, which now keeps
> those visibly distinct).
>
> **Tested, not just written**: `lib/db/test/rls.local.test.mjs` (53
> assertions — RPC-bypass closure, forgery prevention, AAL boundaries,
> concurrency, webhook lease) + `lib/db/test/rls-full-matrix.local.test.mjs`
> (51 assertions — a systematic per-table sweep of this matrix) = 104
> real-SQL RLS assertions, all passing against a throwaway local Docker
> Postgres, using real `SET ROLE`/session-JWT-claim role-switching (RLS
> is never enforced for a table owner or superuser, so a real test must
> switch to a non-owner role for a policy to matter at all). See
> `lib/db/test/last-run-output.txt` for the full captured run.
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
  and — Round 2 — `subscriptions`) require AAL2 for `SELECT`, not just
  AAL1.
- **service_role** — Supabase's server-side key. `BYPASSRLS` skips every
  policy on this list, but **does not imply any base SQL privilege** —
  it still needs the `GRANT`s at the bottom of `0002_rls.sql`.

## Cell notation — 3 distinct failure modes, kept visibly separate

Round 2's central correction: a denial can happen at **three different
layers**, and conflating them was exactly what the earlier notation got
wrong for `service_role` (and, it turned out, for several `authenticated`
cells too, once the `GRANT` block was tightened). Each cell is
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
  at all ("permission denied for table/function ..."). This is new,
  precise information Round 1's blanket `GRANT ... ON ALL TABLES`
  couldn't express — Round 2 enumerates grants per operation to match
  the actual policy set exactly (`0002_rls.sql`'s GRANT-block comment),
  so `⊘` now marks a real, additional layer of defense, not merely "no
  policy happens to exist."
- **`(trigger)`** suffix — a real Postgres trigger
  (`0001_functions_triggers.sql`) blocks it regardless of role/grant/
  policy — the strongest guarantee, holds even for `service_role`.
- **`(RPC)`** suffix — no raw write path exists at all for this cell;
  the *only* real path is a named `SECURITY DEFINER` RPC, which bypasses
  RLS/GRANT by privilege and re-checks ownership/role itself. Noted
  per-row which RPC, and whether it actually admits this role (a
  `SECURITY DEFINER` function being *callable* — `EXECUTE` granted — is
  not the same as it *succeeding* for every caller).
- **"(grant, unused by convention)"** — the `GRANT` genuinely permits
  it (usually `service_role`'s broad access) and no trigger blocks it,
  but no code path is expected to ever do this. Marked `✓` with this
  qualifier, not silently downgraded to `✗`/`⊘` — the technical
  capability is real, only the *intent* is "don't."

| # | Table | anon | user (owner) | user (other) | admin (AAL1) | admin (AAL2) | service_role |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | ⊘⊘⊘⊘ | ✓ ⊘ ⊘(RPC¹) ⊘ | ✗ ⊘ ⊘ ⊘ | ✓ ⊘ ⊘(RPC²) ⊘ | ✓ ⊘ ⊘(RPC²) ⊘ | ✓✓✓✓ |
| 2 | `quran_bookmarks` | ⊘⊘⊘⊘ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 3 | `quran_reading_progress` | ⊘⊘⊘⊘ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 4 | `quran_memorization_stats` | ⊘⊘⊘⊘ | ✓✓✓✓ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✓ |
| 5 | `enrollments` | ⊘ ✓ ⊘ ⊘ | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✓ ✓ ✗ ✗ | ✓✓✓✓ | ✓✓✓✓ |
| 6 | `plans` | ✓³ ⊘ ⊘ ⊘ | ✓³ ✗ ✗ ⊘ | ✓³ ✗ ✗ ⊘ | ✓ ✗ ✗ ⊘ | ✓✓✓⊘⁴ | ✓✓✓✓(convention⁴) |
| 7 | `subscriptions` | ⊘⊘⊘⊘ | ✓ ⊘ ✗ ⊘ | ✗ ⊘ ✗ ⊘ | ✗ ⊘ ✗ ⊘ | ✓ ⊘ ✓ ⊘ | ✓✓✓✓ |
| 8 | `payments` | ⊘⊘⊘⊘ | ✓⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✓ ⊘(RPC⁵) ⊘ ⊘ | ✓ ✓ ✓(trigger⁶) ✗(trigger) |
| 9 | `provider_events` | ⊘⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✓⊘⊘⊘ | ✓ ✓ ✓⁷ ✓(convention) |
| 10 | `manual_payments` | ⊘⊘⊘⊘ | ✓✓⊘⊘ | ✗✓⊘⊘ | ✗✓⊘⊘ | ✓ ✓ ⊘(RPC⁸) ⊘ | ✓✓✓(convention)✓(convention) |
| 11 | `invoices` | ⊘⊘⊘⊘ | ✓✗⊘⊘ | ✗✗⊘⊘ | ✗✗⊘⊘ | ✓ ✓(trigger⁹) ⊘ ⊘ | ✓ ✓(trigger⁹) ✓(convention) ✓(convention) |
| 12 | `coupons` | ⊘⊘⊘⊘¹⁰ | ✗✗✗✗¹⁰ | ✗✗✗✗¹⁰ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 13 | `coupon_redemptions` | ⊘⊘⊘⊘ | ✓⊘⊘⊘ | ✗⊘⊘⊘ | ✓⊘⊘⊘ | ✓⊘⊘⊘ | ✓✓✓(convention)✓(convention) |
| 14 | `blogs` | ✓¹¹⊘⊘⊘ | ✓¹¹✗✗✗ | ✓¹¹✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 15 | `testimonials` | ✓¹¹⊘⊘⊘ | ✓¹¹✗✗✗ | ✓¹¹✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 16 | `trial_requests` | ⊘✓⊘⊘ | ✗✓✗✗ | ✗✓✗✗ | ✓✓✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 17 | `subscribers` | ⊘✓⊘⊘ | ✗✓✗✗ | ✗✓✗✗ | ✓✓✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 18 | `notifications` | ⊘⊘⊘⊘ | ✓✗⊘(RPC¹²)✓ | ✗✗⊘✗ | ✗✗⊘✗ | ✓✓⊘(RPC¹²)⊘¹³ | ✓✓✓✓ |
| 19 | `notification_preferences` | ⊘⊘⊘⊘ | ✓✓✓⊘ | ✗✗✗⊘ | ✓✗✗⊘ | ✓✗✗⊘ | ✓✓✓(convention)✓(convention) |
| 20 | `admin_audit_log` | ⊘⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✗⊘⊘⊘ | ✓ ⊘(RPC-internal) ⊘ ⊘ | ✓ ✓(convention) ✗(trigger) ✗(trigger) |

## Notes

1. `profiles` owner mutation is RPC-only: **no raw owner `UPDATE`
   policy exists at all** — `update_own_profile_name(text)`, a
   `SECURITY DEFINER` RPC touching only `name`, is the sole write path
   (tested: a raw owner `UPDATE` is denied at the **GRANT** layer —
   `authenticated` has no base `UPDATE` grant on `profiles` at all,
   Round 2 tightened this from "RLS filters it" to "no privilege
   exists").
2. `profiles` admin mutation: **no raw admin `UPDATE`/`INSERT` policy
   exists either**, and (Round 2, finding 1) neither does the base
   `GRANT` any more — a raw admin `UPDATE profiles SET role = 'admin'`
   used to be possible via a parallel policy that sat alongside
   `admin_set_role()`, letting an AAL2 admin bypass the RPC's atomic
   `admin_audit_log` write entirely. Closed: `admin_set_role()` is now
   the **only** way to change a `profiles` row, for either AAL level —
   an AAL1 caller reaches the RPC (`EXECUTE` is `authenticated`-wide)
   but the RPC itself raises unless `is_admin_aal2()`, so AAL1 has no
   path to mutate `profiles` at all, not even via the RPC.
3. `plans` public `SELECT` is scoped to `active = true`; `anon`/
   non-admin `authenticated` both see the same active-only slice
   (`anon` via its own `GRANT`, everyone else via `authenticated`'s
   blanket `SELECT` grant + this same policy).
4. `plans` has **no `DELETE` policy or `GRANT` for `authenticated` at
   any AAL** — plans are never hard-deleted (deactivated + superseded
   instead). `service_role`'s `DELETE` is real (`GRANT` present, no
   trigger blocks it) but unused by convention — no code path is
   expected to call it.
5. `payments` admin AAL2 `INSERT`: **no raw policy any more** (Round 2,
   finding 1 — a raw `payments_insert_admin_aal2` policy used to let an
   AAL2 admin `INSERT` a fabricated `kind='charge' status='succeeded'`
   row directly, since no trigger governs a charge `INSERT` the way
   `validate_refund_insert()` governs a refund one). `admin_issue_refund()`
   is now the only `INSERT` path for anyone but `service_role`, still
   independently governed by `validate_refund_insert()` regardless of
   caller (locked parent row, succeeded-only, amount cap, matching
   user/currency/gateway — tested, including the RPC itself rejecting
   an oversized refund).
6. `payments` service_role `UPDATE`: `GRANT` present (unrestricted), but
   `enforce_payment_status_transition()` still governs it — allowed only
   while a row is `pending`; `succeeded`/`failed` rows reject it
   regardless of role. Shown as `✓ (trigger⁶)` because it's a real,
   conditional capability (works for a still-`pending` row), not a flat
   denial like the `DELETE` cell.
7. `provider_events` service_role `UPDATE`: the real path is
   `claim_provider_event()`/`complete_provider_event()` (0001/0003) —
   plain `LANGUAGE sql`/`plpgsql` functions, **not** `SECURITY DEFINER`,
   so they run with the *caller's* privileges and are themselves bound
   by RLS/GRANT. `EXECUTE` on both is `service_role`-only (Round 2's
   GRANT redesign) — even an `authenticated` admin session with
   `is_admin_aal2()` true cannot call them (tested: "permission denied
   for function"). `reclaim_stale_provider_events()` (0003, Round 2
   finding 7) is the same shape: `service_role`-only, resets a
   `processing` row past its staleness threshold back to `pending`.
8. `manual_payments` admin AAL2 `UPDATE`: **no raw policy any more**
   (Round 2, finding 1 — a raw `manual_payments_update_admin_aal2`
   policy used to let an AAL2 admin bypass `admin_review_manual_payment()`'s
   `FOR UPDATE` pending-claim, meaning the same row could be "approved"
   twice by two racing raw `UPDATE`s, and always bypassed the atomic
   `admin_audit_log` write). Closed: the RPC is now the only review path.
9. `invoices` `INSERT` (admin AAL2 and `service_role` both): **no RPC
   wraps this** (a receipt snapshot, not a ledger mutation with a
   concurrency race — no atomicity/locking need an RPC would add).
   Instead a real trigger, `validate_invoice_insert()` (0001, Round 2
   finding 1, mirrors `validate_refund_insert()`), backs the raw
   `INSERT` policy: rejects unless `payment_id` names a real, succeeded
   `payments` row with a matching `user_id`/`currency_snapshot` — a raw
   insert (by admin *or* `service_role`, the trigger has no role
   exception) can no longer fabricate a receipt disconnected from an
   actual successful charge. `invoices` has **no `UPDATE` policy or
   `GRANT` for `authenticated` at any AAL** — an invoice is immutable
   once issued (tested: even AAL2 admin's raw `UPDATE` is denied at the
   `GRANT` layer, not merely filtered by RLS).
10. `coupons` has no `anon`/non-admin `authenticated` `SELECT` `GRANT`/
    policy at all — code validation at checkout is intended to go
    through a server-side RPC (deferred), never a raw client
    `SELECT * FROM coupons WHERE code = ...`.
11. `blogs`/`testimonials` public `SELECT` is scoped to `published =
    true`.
12. `notifications` owner mutation is RPC-only (`mark_notification_read()`,
    same pattern as note 1) — **but the RPC itself is strictly
    self-scoped** (`WHERE id = p_id AND user_id = auth.uid()`, no
    `is_admin()` branch at all). This means an AAL2 admin calling
    `mark_notification_read()` on another user's notification also
    affects 0 rows — admin has genuinely **no** way to mark someone
    else's notification read, whether raw (no policy/grant) or via the
    RPC (self-scoped). Admin's only real notifications capability is
    `INSERT` (an `admin_announcement`, AAL2-gated) and `SELECT` (note 13).
13. `notifications` admin AAL2 `DELETE`: **no admin delete policy
    exists** — only `notifications_delete_own` (owner). An AAL2 admin's
    `DELETE` on another user's notification affects 0 rows (tested).
    Owner `DELETE` of their *own* notification ("dismiss") does work
    (tested) — this cell is specifically about admin acting on someone
    else's row.
14. `admin_audit_log` admin AAL2 `INSERT`/`UPDATE`/`DELETE`: **no policy
    or `GRANT` at all**, for any authenticated session (Round 2, finding
    1 — a raw `admin_audit_log_insert_admin_aal2` policy used to let any
    AAL2 admin insert arbitrary audit rows directly, forging a fake
    "this happened" entry independent of whether the mutation it claims
    actually occurred). Closed entirely: every real write happens only
    from inside `admin_set_role()`/`admin_review_manual_payment()`/
    `admin_issue_refund()`, as the function owner (`SECURITY DEFINER`
    bypasses RLS/GRANT by privilege, not by policy/grant presence) — the
    mutation and its audit row are atomic and neither can happen without
    the other. `service_role`'s `UPDATE`/`DELETE` cells show `(trigger)`
    specifically because, unlike `authenticated`, `service_role` **does**
    hold the base `GRANT` (unrestricted) — so for that one role,
    `forbid_audit_log_mutation()` is the actual, load-bearing guard, not
    a redundant layer sitting behind an already-closed `GRANT`.

## Round 1's 2 open follow-up items — both resolved this round

Round 1's matrix flagged 2 real, tested-but-undecided behaviors and
deliberately left them for the user rather than silently fixing them
mid-remediation. Both were explicitly decided and closed in Round 2:

- **`quran_bookmarks`/`quran_reading_progress`/`quran_memorization_stats`
  admin `DELETE`**: Round 1's shared `FOR ALL` policy let admin (either
  AAL) delete another user's row via its `USING` clause alone, with no
  audit trail. Decided: fix now. Split into a pure owner `FOR ALL` +
  read-only admin `SELECT` — admin's `DELETE` cell above is now a flat
  `✗` for all 3 tables (tested).
- **`notifications` admin read**: Round 1 had no admin read policy at
  all. Decided: AAL2 gets full read. `notifications_select_admin_aal2`
  added — AAL1 still gets none (tested).

No new open/undecided items surfaced in Round 2 — every finding from
the review that prompted this round was either fixed (findings 1, 2, 3,
5, 6, 7) or was itself a decision already made explicitly by the user
(rate limiting, below).

## Deferred / explicitly out of scope

- **Rate limiting on guest-submittable public forms** (`enrollments`,
  `trial_requests`, `subscribers` anon `INSERT`): still explicitly
  deferred — the earlier "Postgres counters" idea conflicts with
  `rate_limit_counters` being on the DROP list
  (`docs/product-scope-audit.md` §12/§14). **This is a BLOCKING
  pre-production gate, not a low-priority note**: no rate-limit
  enforcement exists in `0002_rls.sql` today, and leaving it open is
  acceptable ONLY because this baseline is local-only and has never been
  applied anywhere. It must be resolved before these anon-INSERT
  endpoints are ever exposed publicly — this is a statement about what
  "deferred" means here, not a signal that it's safe to launch without it.
- The manual-payment-activation RPC and the subscription-cancellation
  RPC referenced in the notes above (already listed as deferred in
  `docs/product-scope-audit.md` §14).
- The coupon-code-validation server-side RPC (note 10).
- Applying any of this to the real Supabase project — a separate,
  later, explicitly-permitted step (see the banner at the top of this
  file).

## Status

**Implemented and tested, Round 2.** `lib/db/drizzle/0002_rls.sql`
(rewritten policies + GRANT block) and `0003_provider_events_lease.sql`
(webhook claim lease/recovery), applied idempotently (twice, back to
back, across all 4 migration files) to a throwaway local Docker
Postgres, with 104 real role-switching RLS assertions passing across
`lib/db/test/rls.local.test.mjs` (53) and
`lib/db/test/rls-full-matrix.local.test.mjs` (51 — the systematic
per-table sweep this round added), plus the pre-existing 62
schema/function assertions in `lib/db/test/schema.local.test.mjs` —
166 total, all captured in `lib/db/test/last-run-output.txt`. **Not
applied to the real Supabase project** — that remains a separate,
later, explicitly-permitted step per `docs/product-scope-audit.md` §13
and `docs/remote-reconciliation-proposal.md`.
