# RLS Matrix — Implemented (`lib/db/drizzle/0002_rls.sql`)

> **This document now describes real, tested `CREATE POLICY` SQL** —
> promoted from the earlier design-only draft (`docs/rls-matrix-draft.md`,
> now superseded and removed; its content lives here, corrected against
> the actual implementation). Every cell below was derived by re-reading
> `lib/db/drizzle/0002_rls.sql` line by line, not carried over from the
> draft unchanged — several cells differ from the original draft where
> the real implementation ended up stricter, looser, or shaped
> differently than the draft anticipated (see the notes; each divergence
> is called out explicitly).
>
> **Tested, not just written**: `lib/db/test/rls.local.test.mjs`, 25/25
> passed, against a throwaway local Docker Postgres, using real
> `SET ROLE`/session-JWT-claim role-switching (RLS is never enforced for
> a table owner or superuser, so a real test must switch to a non-owner
> role for a policy to matter at all). See
> `lib/db/test/last-run-output.txt` for the full captured run.
>
> **Still NOT applied to the real Supabase project.** Per
> `docs/product-scope-audit.md` §13's Migration Policy and
> `docs/remote-reconciliation-proposal.md`: schema + RLS + grants apply
> together as one single, later, separately-permitted step — this
> document and `0002_rls.sql` are that step's design and implementation,
> reviewed and tested locally, not yet executed anywhere near the real
> project.

## Roles

- **anon** — Supabase's unauthenticated client role.
- **user (owner)** — an authenticated `role='user'` account, acting on a
  row it owns (`user_id = auth.uid()` or `profiles.id = auth.uid()`).
- **user (other)** — the same account type, acting on a row it does
  **not** own.
- **admin (AAL1)** — an authenticated `role='admin'` account, no MFA
  step-up verified this session (`public.is_admin()`).
- **admin (AAL2)** — the same admin account after MFA step-up
  (`public.is_admin_aal2()`, i.e. `is_admin() AND auth.jwt()->>'aal' =
  'aal2'`). Confirmed-tightened per an explicit user decision during
  baseline remediation: financial/PII-dense tables (`payments`,
  `manual_payments`, `invoices`, `provider_events`, `admin_audit_log`)
  now require AAL2 for `SELECT`, not just AAL1 — the first draft had
  AAL1 sufficient everywhere, flagged by review as too permissive.
- **service_role** — Supabase's server-side key. `BYPASSRLS` skips every
  policy on this list, but **does not imply any base SQL privilege** —
  a real bug this pass caught (see note 0 below) — so it still needs the
  base `GRANT`s at the bottom of `0002_rls.sql` like every other role.

## Cell notation

Each cell is `SELECT INSERT UPDATE DELETE`, in that fixed order. `✓` =
a `CREATE POLICY` (or the absence of RLS, for `service_role`) actually
permits it; `✗` = no policy permits it. `✗ (trigger)` marks a denial
enforced by a real Postgres trigger from `0001_functions_triggers.sql`
that has no role exception — it holds even for `service_role`, since
`BYPASSRLS` only skips policies, not triggers. `✗ (RPC only)` marks an
operation with no raw policy at all, where the *only* real path is a
`SECURITY DEFINER` RPC that bypasses RLS by privilege and re-checks
ownership/role itself — listed as `✗` here because a raw client
`UPDATE`/whatever genuinely fails; the RPC is a separate, deliberate
door, noted per-row.

| # | Table | anon | user (owner) | user (other) | admin (AAL1) | admin (AAL2) | service_role |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | ✗✗✗✗ | ✓ ✗ ✗ (RPC¹) ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✗² ✓ ✗ | ✓✓✓✓ |
| 2 | `quran_bookmarks` | ✗✗✗✗ | ✓✓✓✓ | ✗✗✗✗ | ✓ ✗³ ✗³ ✓³ | ✓ ✗³ ✗³ ✓³ | ✓✓✓✓ |
| 3 | `quran_reading_progress` | ✗✗✗✗ | ✓✓✓✓ | ✗✗✗✗ | ✓ ✗³ ✗³ ✓³ | ✓ ✗³ ✗³ ✓³ | ✓✓✓✓ |
| 4 | `quran_memorization_stats` | ✗✗✗✗ | ✓✓✓✓ | ✗✗✗✗ | ✓ ✗³ ✗³ ✓³ | ✓ ✗³ ✗³ ✓³ | ✓✓✓✓ |
| 5 | `enrollments` | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 6 | `plans` | ✓⁴ ✗✗✗ | ✓⁴ ✗✗✗ | ✓⁴ ✗✗✗ | ✓✗✗✗ | ✓ ✓ ✓ ✗⁵ | ✓✓✓✗⁵ |
| 7 | `subscriptions` | ✗✗✗✗ | ✓ ✗ ✗⁶ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✗ ✓⁷ ✗ | ✓✓✓✓ |
| 8 | `payments` | ✗✗✗✗ | ✓ ✗⁸ ✗ ✗ (trigger) | ✗✗✗✗ | ✗✗✗✗ | ✓ ✓⁹ ✗ ✗ (trigger) | ✓ ✓ ✓¹⁰ ✗ (trigger) |
| 9 | `provider_events` | ✗✗✗✗ | ✗✗✗✗ | ✗✗✗✗ | ✗✗✗✗ | ✓✗✗✗ | ✓ ✓ ✓¹¹ ✗ |
| 10 | `manual_payments` | ✗✗✗✗ | ✓ ✓ ✗ ✗ | ✗✗✗✗ | ✗✗✗✗ | ✓ ✗ ✓¹² ✗ | ✓✓✓✗ |
| 11 | `invoices` | ✗✗✗✗ | ✓ ✗ ✗ ✗ | ✗✗✗✗ | ✗✗✗✗ | ✓ ✓ ✗ ✗ | ✓ ✓ ✗¹³ ✗¹³ |
| 12 | `coupons` | ✗✗✗✗¹⁴ | ✗✗✗✗¹⁴ | ✗✗✗✗¹⁴ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 13 | `coupon_redemptions` | ✗✗✗✗ | ✓ ✗ ✗ ✗ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓ ✓ ✗¹³ ✗¹³ |
| 14 | `blogs` | ✓¹⁵ ✗✗✗ | ✓¹⁵ ✗✗✗ | ✓¹⁵ ✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 15 | `testimonials` | ✓¹⁵ ✗✗✗ | ✓¹⁵ ✗✗✗ | ✓¹⁵ ✗✗✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 16 | `trial_requests` | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✓✗✗✗ | ✓✓✓✓ | ✓✓✓✓ |
| 17 | `subscribers` | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✗ ✓ ✗ ✗ | ✓✗✗✗ | ✓ ✗¹⁶ ✓ ✓ | ✓✓✓✓ |
| 18 | `notifications` | ✗✗✗✗ | ✓ ✗ ✗ (RPC¹⁷) ✓ | ✗✗✗✗ | ✗✗✗✗¹⁸ | ✗ ✓ ✗ ✗¹⁸ | ✓✓✓✓ |
| 19 | `notification_preferences` | ✗✗✗✗ | ✓ ✓ ✓ ✗¹⁹ | ✗✗✗✗ | ✓✗✗✗ | ✓✗✗✗ | ✓✓✓✗¹³ |
| 20 | `admin_audit_log` | ✗✗✗✗ | ✗✗✗✗ | ✗✗✗✗ | ✗✗✗✗ | ✓ ✓ ✗ (trigger) ✗ (trigger) | ✓ ✓ ✗ (trigger) ✗ (trigger) |

## Notes

0. **`GRANT` bug found and fixed during this pass**: the first version of
   `0002_rls.sql`'s closing `GRANT` block only listed `anon,
   authenticated`. `service_role` has `BYPASSRLS`, but `BYPASSRLS` only
   skips *row-level policy checks* — it does not imply any base SQL
   privilege, so `service_role` got "permission denied for table
   payments" / "... provider_events" until this was caught by actually
   running `rls.local.test.mjs` and fixed by adding `service_role` to
   all three `grant` statements.
1. **`profiles` owner mutation is RPC-only, not a raw policy** — a real,
   stronger resolution than the draft's note 1 speculated (a
   `REVOKE UPDATE(role)` column-privilege grant, or a rejecting
   trigger). The implementation instead has **no raw owner `UPDATE`
   policy on `profiles` at all** — a user's direct `UPDATE profiles SET
   ... WHERE id = auth.uid()` is silently filtered to 0 rows (tested).
   The only owner-write path is `update_own_profile_name(text)`, a
   `SECURITY DEFINER` RPC that only ever touches the `name` column,
   sidestepping the column-privilege problem entirely rather than
   fighting `GRANT`/`REVOKE` column privileges.
2. **`profiles` admin `INSERT` is `✗` for both AAL levels** — a
   divergence from the draft, which guessed `✓` for AAL2. The real
   implementation has no admin `INSERT` policy on `profiles` at all;
   every row is created exclusively by `handle_new_user()` (a
   `SECURITY DEFINER` trigger function firing off `auth.users`, which
   bypasses RLS by privilege, not by policy). An admin never directly
   inserts a `profiles` row. Admin role changes go through
   `admin_set_role()` (an `UPDATE`, not an `INSERT`), which is real,
   AAL2-gated, and atomically writes `admin_audit_log` — tested.
3. **Real finding from re-reading the SQL, not anticipated by the
   draft**: `quran_bookmarks`/`quran_reading_progress`/
   `quran_memorization_stats` share one `FOR ALL` policy —
   `USING (user_id = auth.uid() OR is_admin())` /
   `WITH CHECK (user_id = auth.uid())`. Postgres applies `USING` alone
   to `SELECT` and `DELETE`, and both `USING` + `WITH CHECK` to
   `UPDATE` (`WITH CHECK` alone to `INSERT`). The practical effect:
   admin's `USING` clause (`is_admin()`) lets them target **any** row
   for `SELECT` and `DELETE` — an admin genuinely **can delete another
   user's Quran bookmark/progress/stats row** today, at either AAL
   level, with no audit trail (unlike every admin mutation on
   financial/role data, which goes through an audited RPC). But `WITH
   CHECK` still requires the *resulting* row's `user_id = auth.uid()`
   (the admin's own id) — so an admin's `UPDATE`/`INSERT` on another
   user's row fails unless they reassign ownership to themselves, which
   defeats the purpose. Net effect: admin has real, untracked delete
   power over personal (non-financial) Quran data, but not edit/insert
   power. **Flagged as worth a follow-up decision** (tighten `DELETE` to
   require AAL2, or add an audited RPC, or accept as-is for "admin
   support cleanup") — not fixed in this pass, since it wasn't part of
   the confirmed remediation scope, but it's a real, mechanically-
   derived behavior of the shipped SQL, not a hypothetical.
4. `plans` public `SELECT` is scoped to `active = true`.
5. `plans` has **no `DELETE` policy at all**, for any role including
   AAL2 admin — the locked design (`plans.ts`'s doc comment) never
   hard-deletes a plan, only deactivates + supersedes. `service_role`'s
   `DELETE` cell is marked `✗` to reflect this design convention, even
   though `BYPASSRLS` + the base `GRANT` technically permit it — no code
   path is expected to ever call it.
6. `subscriptions` owner `UPDATE` is `✗`: cancellation is meant to go
   through a deferred server-side RPC (not built this pass —
   `docs/product-scope-audit.md` §14), not a direct client write.
7. `subscriptions` admin AAL2 `UPDATE`: manual overrides only, via the
   real `subscriptions_update_admin_aal2` policy — no dedicated RPC
   built for this yet.
8. `payments` owner `INSERT` is `✗`: every row is server/webhook-
   written, never inserted directly by the paying client.
9. `payments` admin AAL2 `INSERT` is real (`payments_insert_admin_aal2`)
   — the only sanctioned use is issuing a `kind='refund'` row, with
   `validate_refund_insert()` (0001) independently enforcing every real
   constraint (locked parent row, succeeded-only, amount cap, matching
   user/currency/gateway) regardless of who inserts. The recommended
   caller is `admin_issue_refund()`, which additionally writes
   `admin_audit_log` atomically — both the raw policy and the RPC path
   are tested (including the RPC rejecting an oversized refund, proving
   it doesn't bypass the trigger).
10. `payments` service_role `UPDATE` is still governed by the real
    `enforce_payment_status_transition()` trigger — allowed only while a
    row is `pending`; `succeeded`/`failed` rows reject it regardless of
    role.
11. `provider_events`: **no `INSERT`/`UPDATE` policy exists for
    `authenticated` at all** — a stronger closure than the draft
    described. `claim_provider_event()`/`complete_provider_event()`
    (0001) are plain `LANGUAGE sql`/`plpgsql` functions, **not**
    `SECURITY DEFINER` — they run with the *caller's* privileges, so
    they are themselves bound by these same (nonexistent, for
    `authenticated`) policies. In practice this means only
    `service_role` (via `BYPASSRLS`) can successfully call them; even an
    admin with `EXECUTE` granted on the function would still get 0 rows
    back, since the underlying `UPDATE` has no policy permitting it for
    `authenticated`. This matches intent (webhook worker only) but is
    enforced structurally, not just by convention.
12. `manual_payments` admin AAL2 `UPDATE`: the pending→approved/rejected
    review decision — both the raw policy and the recommended
    `admin_review_manual_payment()` RPC (atomic with `admin_audit_log`,
    row-locked via `FOR UPDATE`) are real and tested. Activating the
    corresponding `subscriptions` row on approval remains a separately-
    designed, deferred RPC (§14), deliberately not folded in here.
13. Marked `✗` for `service_role` to record the intended design (never
    mutate/delete these append-only rows even from trusted server code);
    `BYPASSRLS` + the base `GRANT` make it technically possible, no code
    path is expected to call it, and for `admin_audit_log` a real
    trigger (`forbid_audit_log_mutation()`) blocks it outright with no
    role exception.
14. `coupons` has no anon/user `SELECT` policy at all — code validation
    at checkout is intended to go through a server-side RPC (deferred),
    never a raw client `SELECT * FROM coupons WHERE code = ...`.
15. `blogs`/`testimonials` public `SELECT` is scoped to `published =
    true`.
16. `subscribers` admin AAL2 `INSERT` is `✗`: nothing inserts a
    subscriber row on an admin's behalf; the only `INSERT` path is the
    public guest-signup policy (`anon, authenticated`, same row as
    everyone else in this column set).
17. `notifications` owner `UPDATE` is RPC-only, same pattern as note 1:
    **no raw owner `UPDATE` policy exists at all** — the only mutation
    path is `mark_notification_read()`, a `SECURITY DEFINER` RPC that
    only flips `read = true` on a row the caller owns (tested: user B
    calling it with user A's notification id affects 0 rows). This
    avoids the column-privilege problem (`title`/`body`/`meta` staying
    off-limits to the owner) the same way `update_own_profile_name()`
    does for `profiles.name`.
18. **Real divergence from the draft, worth flagging**: `notifications`
    has **no admin `SELECT` policy at all** —
    `notifications_select_own` is `user_id = auth.uid()` only, with no
    `OR is_admin()`/`is_admin_aal2()` clause, unlike every other owner-
    scoped table in this matrix. The draft assumed admin AAL1 read
    access here (`✓✗✗✗`); the shipped SQL grants admin **zero** access
    to any user's notifications, at either AAL level. This may be
    intentional (notifications aren't considered support-relevant data)
    or an oversight carried through from the draft without being
    revisited — **flagged as a second follow-up item**, not fixed in
    this pass for the same reason as note 3 (outside the confirmed
    remediation scope; a real, tested behavior of the shipped SQL that
    the user should get to decide on, not one I should silently change).
19. `notification_preferences` owner `DELETE` is `✗`: a 1:1 settings
    singleton; "reset" means updating fields back to defaults.

## Deferred / explicitly out of scope

- **Rate limiting on guest-submittable public forms** (`enrollments`,
  `trial_requests`, `subscribers` anon `INSERT`): explicitly deferred by
  user decision during baseline remediation — the earlier "Postgres
  counters" idea conflicts with `rate_limit_counters` being on the DROP
  list (`docs/product-scope-audit.md` §12/§14). No rate-limit enforcement
  exists in `0002_rls.sql` today; anon can insert as many rows as it
  wants to these three tables. A real mechanism (edge-function-level
  limiting, a new counters table, or a Supabase-native option) is a
  separate, later decision.
- The two follow-up findings in notes 3 and 18 above (admin's untracked
  Quran-data delete power; notifications having no admin read policy at
  all) — real, tested behaviors of the shipped SQL, deliberately left as
  a decision for the user rather than silently changed mid-remediation.
- The manual-payment-activation RPC and the subscription-cancellation
  RPC referenced in notes 7/12 (already listed as deferred in
  `docs/product-scope-audit.md` §14).
- The coupon-code-validation server-side RPC (note 14).
- Applying any of this to the real Supabase project — a separate,
  later, explicitly-permitted step (see the banner at the top of this
  file).

## Status

**Implemented and tested.** `lib/db/drizzle/0002_rls.sql` (helper
functions, `ENABLE ROW LEVEL SECURITY` on all 20 tables, every policy in
the matrix above, 5 `SECURITY DEFINER` RPCs, and the corrected `GRANT`
block) exists as a real, versioned migration, applied idempotently
(twice, back to back) to a throwaway local Docker Postgres, with 25/25
real role-switching tests passing (`lib/db/test/rls.local.test.mjs`,
captured in `lib/db/test/last-run-output.txt`). **Not applied to the
real Supabase project** — that remains a separate, later,
explicitly-permitted step per `docs/product-scope-audit.md` §13 and
`docs/remote-reconciliation-proposal.md`.
