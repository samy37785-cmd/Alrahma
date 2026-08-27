# Al-Rahma Backend — Engineering Patch Plan

**Status: PLANNING ONLY. No code has been modified. Nothing has been committed, branched, or pushed.**
**Source of truth:** `BACKEND_AUDIT_2026-07-07.md` (original audit) + `BACKEND_AUDIT_VERIFICATION_2026-07-07.md` (independent verification pass — 1 False Positive found: `ARCH-1`, excluded below; all other findings Confirmed, several with corrected severity/line-numbers/counts as noted in that document).
**Scope:** transform every **Confirmed** finding into an execution-ready patch plan: priority, design, alternatives, risk, rollback, tests, PR sequencing, dependency posture, and a role-by-role sign-off.
**Execution model (per explicit instruction):** this document defines the full plan up front, but it will be **implemented one PR at a time**. Each PR ships, CI must pass, and explicit approval is required before the next PR starts. No batch execution.

---

## Phase 1 — Priority Validation

### Method

Every Confirmed finding was re-scored on 6 impact dimensions (1=negligible, 5=severe) and 3 delivery dimensions (1=hard/risky, 5=easy/safe), re-verified against the verification document rather than the original audit's severity labels, which is why a few items move relative to the original Critical/High/Medium/Low ranking.

| Dimension | What it measures |
|---|---|
| Exploitability | How directly and by whom the issue can be triggered |
| Security Impact | Confidentiality/integrity/availability of a security control |
| Business Impact | Revenue, legal/compliance, reputational exposure |
| User Impact | Breadth × severity of effect on end users |
| Data Integrity | Risk of corrupt, inconsistent, or unauthorized data |
| Likelihood | Probability this actually manifests given real traffic patterns |
| Ease of Fixing | 5 = same-day one-liner, 1 = multi-day cross-cutting change |
| Regression Risk | 5 = touches nothing else, 1 = touches shared/critical logic |
| Deployment Risk | 5 = safe to ship any time, 1 = needs coordination/downtime-sensitive |

**Composite Priority = (Exploitability + Security + Business + User + DataIntegrity + Likelihood) + Ease − (6 − RegressionRisk) − (6 − DeploymentRisk)**, i.e. impact pulls priority up, and fixes that are cheap/safe to ship are pulled forward relative to fixes of similar impact that are risky or slow. Higher composite = fix sooner.

### Scoring table (Critical/High/Medium tier — Low tier is handled as a single backlog batch, see end of section)

| Finding | Exploit. | Sec. | Biz. | User | DataInt. | Likel. | Ease | RegRisk | DeployRisk | **Composite** |
|---|---|---|---|---|---|---|---|---|---|---|
| **SEC-1** mass-assignment | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 5 | **34** |
| **C-1** coupon dead redemption | 4 | 2 | 5 | 4 | 5 | 5 | 3 | 3 | 4 | **27** |
| **DB-2** unpublished-course leak | 5 | 3 | 3 | 2 | 1 | 5 | 5 | 5 | 5 | **28** |
| **SEC-DEP** nodemailer CVE | 2 | 4 | 2 | 1 | 1 | 1 | 5 | 5 | 5 | **17** |
| **SEC-2** non-MFA admin path | 3 | 5 | 4 | 3 | 4 | 2 | 2 | 2 | 1 | **20** |
| **DB-1** unindexed search / DoS | 4 | 3 | 3 | 4 | 1 | 4 | 2 | 3 | 3 | **20** |
| **REL-1** cron scheduler missing | 1 | 1 | 4 | 3 | 1 | 3 | 5 | 5 | 5 | **18** |
| **REL-2** test-coverage gap | 1 | 1 | 2 | 3 | 2 | 3 | 3 | 5 | 5 | **14** |
| **ARCH-3** validation opt-in | 2 | 3 | 2 | 2 | 3 | 3 | 2 | 2 | 3 | **13** |
| **SEC-3** financialGuard unwired | 2 | 3 | 3 | 1 | 2 | 2 | 3 | 3 | 2 | **13** |
| **SEC-6** email HTML injection | 2 | 2 | 2 | 2 | 1 | 2 | 5 | 5 | 5 | **16** |
| **DB-8** cron dedup races | 1 | 1 | 2 | 3 | 3 | 3 | 3 | 4 | 4 | **13** |
| **DB-9** unbounded getConversation | 2 | 1 | 1 | 3 | 1 | 3 | 4 | 5 | 5 | **13** |
| **DB-5** view-counter write-on-read | 1 | 1 | 2 | 2 | 1 | 4 | 3 | 4 | 4 | **11** |
| **REL-3** exitOnError/no exit handler | 1 | 2 | 2 | 2 | 2 | 2 | 5 | 5 | 5 | **16** |
| **REL-4** no metrics/alerting on /ready | 1 | 2 | 3 | 3 | 1 | 3 | 3 | 5 | 5 | **15** |
| **REL-5** rate-limit hits not logged | 1 | 2 | 1 | 1 | 1 | 3 | 5 | 5 | 5 | **14** |
| **ARCH-5** two error idioms | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 3 | 4 | **6** |
| **ARCH-6** pagination envelope | 1 | 1 | 1 | 2 | 1 | 3 | 4 | 5 | 5 | **13** |
| **ARCH-3v** versioning inconsistency | 1 | 1 | 2 | 1 | 1 | 2 | 2 | 3 | 3 | **8** |
| **DB-3** getContacts N+1 (downgraded) | 1 | 1 | 1 | 2 | 1 | 2 | 3 | 4 | 4 | **10** |
| **SEC-5** CORS regex (downgraded) | 1 | 2 | 1 | 1 | 1 | 1 | 4 | 5 | 5 | **12** |

### Final implementation priority (Critical/High/Medium tier)

1. **SEC-1** (34) — mass-assignment / account takeover
2. **DB-2** (28) — unpublished-course leak
3. **C-1** (27) — coupon dead redemption
4. **SEC-2** (20) — non-MFA admin path
5. **DB-1** (20) — unindexed search / DoS amplifier
6. **REL-1** (18) — cron scheduler missing
7. **SEC-DEP** (17) — nodemailer CVE
8. **SEC-6** (16) — email HTML injection
9. **REL-3** (16) — exitOnError / no crash-exit handler
10. **REL-4** (15) — no metrics/alerting, health check blind to DB
11. **REL-2** (14) — test-coverage gap
12. **REL-5** (14) — rate-limit hits not logged
13. **ARCH-3** (13) — validation opt-in
14. **SEC-3** (13) — financialGuard unwired
15. **DB-8** (13) — cron dedup races
16. **DB-9** (13) — unbounded getConversation
17. **ARCH-6** (13) — pagination envelope inconsistency
18. **SEC-5** (12) — CORS regex
19. **DB-5** (11) — view-counter write-on-read
20. **DB-3** (10) — getContacts N+1
21. **ARCH-3v** (8) — versioning inconsistency
22. **ARCH-5** (6) — two error idioms

**Low tier (backlog, batched — see Phase 2/3 "Batch L"):** SEC-4, SEC-L2, SEC-L3, SEC-L4 (accepted, no fix), SEC-L5, DB-4, DB-6, DB-7, DB-L3 (monitor only), DB-L4, DB-L5 (accepted), ARCH-L1, ARCH-L2 (convention note, no mandatory fix), ARCH-L3, REL-L1 (accepted), REL-L2, REL-L3 (same fact as REL-4, no separate fix). None of these score above single digits on the composite scale and none carry exploitability, business, or data-integrity weight worth interrupting the Critical/High/Medium queue for.

### Where this disagrees with the original audit/verification ordering, and why

- **DB-2 moves from "5th in the Top 5" up to #2 overall.** The verification pass explicitly called it "the best available risk-reduction-per-minute-of-engineering-time in the entire list" — a live, currently-occurring confidentiality leak (draft course content publicly searchable) with a genuinely zero-regression-risk, two-line fix. Once "ease of fixing" and "regression risk" are weighted quantitatively rather than qualitatively, it outranks even SEC-2 and DB-1, which are more severe in the abstract but slower and riskier to fix safely.
- **SEC-DEP (nodemailer CVE) drops from "top-5, do it early" to #7,** not because it's unimportant, but because direct evidence gathered in this planning phase (see Phase 4) shows **the vulnerable `raw` send option is never used anywhere in this codebase** — a repo-wide grep of every file that calls `sendMail` found zero uses of `raw`. The CVE is real and the patch is still a same-day no-brainer (which is why it's still in the top 10, not the backlog), but it is not live-exploitable through this application's own code today, which is new information not available at audit time and changes its Exploitability/Likelihood scoring from what a blanket "High severity CVE" label would suggest.
- **SEC-2 does not move to #1** despite being the most severe *security architecture* problem, because fixing it safely requires frontend coordination (the code's own TODO says so) and cannot be done as a same-day, low-regression-risk patch — it is still #4, reflecting that it should be started immediately but will not be the first PR to merge.
- **REL-2 (test-coverage gap) moves down** relative to how prominently it was discussed in the audit, because writing new tests, while valuable, has no direct production-risk-reduction on its own (it doesn't fix a bug, it reduces the chance of a *future* bug going unnoticed) — it is sequenced as ongoing/parallel work rather than a release blocker.

---

## Phase 2 — Patch Design

Findings are presented in the Phase 1 priority order. Each entry has the full required structure. For the Low-tier backlog, a condensed batch table follows the individually-designed items (proportional detail — see rationale at the end of that section).

---

### 1. SEC-1 — Mass-assignment on admin `PUT /users/:id`

**Problem:** `crudController.js`'s generic `update()` handler does `Object.assign(doc, body)` with `body` being the raw, unfiltered `req.body`, and the `users` CRUD registration passes no `updateMiddleware` to sanitize it. Any principal holding the `users:write` permission scope can set `password`, `role`, `subscription.*`, or `tokenVersion` on any user document.

**Root Cause:** the generic CRUD factory (`crudController.js`) was built as a schema-agnostic abstraction for admin resources. It correctly supports an optional `updateMiddleware` hook for per-resource sanitization (this is exactly how the equivalent bug was already fixed once, for coupons, via a bespoke `COUPON_UPDATABLE_FIELDS` allowlist inside `couponController.js` rather than the generic factory) — but nobody wired an equivalent allowlist/middleware into the `users` resource's CRUD registration when it was added. The abstraction's safety depends on every caller remembering to opt in to field filtering; there is no safe-by-default behavior.

**Affected Files:**
- `backend/controllers/crudController.js` (no change needed here if Alternative A is chosen — see below)
- `backend/routes/v1/admin/usersRoutes.js` (the actual fix site)

**Affected Functions:**
- `crudController.js` → `update()` (factory-internal, unexported)
- `usersRoutes.js` → the `createCRUDController(User, {...})` configuration object

**Design (preferred fix):** add an `updateMiddleware` function to the `users` CRUD registration that strips disallowed keys from `req.body` before it reaches `Object.assign`. Disallow list: `password`, `role`, `tokenVersion`, `subscription`, `_id`, `googleId`, `createdAt`, `updatedAt`, `__v`. Everything else (name, email, specialization, teacher assignment, etc.) passes through unchanged, preserving current legitimate admin-edit functionality.

```js
// usersRoutes.js — illustrative, not applied
const DISALLOWED_USER_FIELDS = ['password', 'role', 'tokenVersion', 'subscription', '_id', 'googleId', 'createdAt', 'updatedAt', '__v'];
const users = createCRUDController(User, {
  // ...existing options...
  updateMiddleware: async (body) => {
    const filtered = { ...body };
    for (const key of DISALLOWED_USER_FIELDS) delete filtered[key];
    return filtered;
  },
});
```

**Alternative Designs:**
- **Alternative A (preferred, above):** allowlist/blocklist via `updateMiddleware` at the route-registration call site. *Pros:* zero changes to the shared `crudController.js` factory (no blast radius on courses/enrollments, which also use it); mirrors the exact pattern already proven correct for coupons; reviewable in a two-line diff. *Cons:* relies on remembering to configure it per-resource — doesn't fix the *systemic* footgun that a future new CRUD resource could reintroduce the same bug.
- **Alternative B:** make `crudController.js`'s `update()` require an explicit `allowedUpdateFields` array in its options object, and throw at startup if a resource registers without one (secure-by-default at the factory level). *Pros:* closes the systemic gap — impossible to add a new mass-assignment-vulnerable resource by omission. *Cons:* touches the shared factory used by `users`, `courses`, and `enrollments` simultaneously, meaning a single PR now has three resources' worth of regression surface instead of one; requires auditing what fields `courses`/`enrollments` update today to build their allowlists correctly in the same change, which is not free and increases the chance of breaking a currently-working admin edit.
- **Why Alternative A is preferred:** the immediate goal is closing the critical vulnerability with the smallest possible blast radius and the fastest possible safe merge. Alternative B is the better *long-term* systemic fix and is recommended as a **follow-up P2 item** once A has shipped and been observed stable in production for at least one release cycle — sequencing B before A would delay the critical fix behind a larger, riskier change for no safety benefit today.

**Risk Assessment:** Low. The only behavioral change is that four specific fields become unwritable through this endpoint. Regression would manifest as: an admin UI feature that currently (perhaps inadvertently) relies on `PUT /users/:id` to change a user's role or subscription would break. Grep of the frontend admin console's user-edit form is required before merge to confirm it does not currently rely on this endpoint for role/subscription changes (those already have dedicated endpoints — `PATCH /users/:id/role`, `PATCH /users/:id/subscription` — so this is expected to be safe, but must be verified, not assumed).

**Rollback Plan:** revert the single commit that adds `updateMiddleware` to `usersRoutes.js`. No data migration, no schema change, no state to unwind — the change is purely request-time filtering logic. Rollback is a one-line git revert with zero downstream cleanup.

**Test Plan:**
- **Unit:** call the `updateMiddleware` function directly with a payload containing `password`, `role`, `subscription`, `tokenVersion` and assert all four are stripped while `name`/`email` pass through.
- **Integration:** `PUT /api/v1/admin/users/:id` with a body containing `{name: 'New Name', role: 'admin', password: 'hacked123'}` as an authenticated `users:write` admin → assert response reflects `name` updated, `role` and `password` unchanged in the DB afterward (fetch the user post-request and assert `role !== 'admin'`, and assert the password hash is byte-identical to before the request).
- **Regression:** re-run `tests/admin-update-validation.test.js` and `tests/admin-rbac.test.js` in full (both already exercise this route) — must remain green with no assertion changes needed if the legitimate-field-editing behavior is unaffected.
- **Edge cases:** empty body (`{}`) → no-op update, 200 response; body containing only disallowed fields → 200 response with the document otherwise unchanged (not an error — silently dropping disallowed fields, not rejecting the whole request, matches the existing coupon-fix precedent).
- **Negative test:** attempt the same escalation payload as a `users:read`-only principal (no `users:write`) → expect 403 from the existing `requirePermissions` middleware (proves RBAC layering is unaffected).
- **Security test:** a dedicated new test asserting that repeated attempts to set `role: 'admin'` via this endpoint never succeed, across all documented disallowed fields — this becomes a permanent regression guard specifically for this vulnerability class.
- **Performance:** none expected; `updateMiddleware` is an O(1) key-deletion over a small fixed list, no measurable overhead.

---

### 2. DB-2 — `globalSearch`/`searchCourses` leak unpublished courses

**Problem:** the Course branch of both `globalSearch` and `searchCourses` in `searchController.js` queries `Course` with no `published: true` filter, unlike the sibling `Blog` branch, which correctly filters on it. Draft/unreleased course content is publicly discoverable via the search endpoint.

**Root Cause:** the Blog branch was written (or later hardened) with the publication-state filter; the Course branch was not updated to match when the same pattern was extended to courses, and there is no shared query-builder that would have enforced the filter for both automatically.

**Affected Files:** `backend/controllers/searchController.js`

**Affected Functions:** `globalSearch`, `searchCourses`

**Design:** add `published: true` to the `Course.find({...})` filter object in both functions — the exact same clause already present on the `Blog.find({...})` call directly above/beside each.

**Alternative Designs:**
- **Alternative A (preferred):** add the filter inline at both call sites, matching the existing Blog pattern exactly. *Pros:* minimal diff, immediately reviewable by comparing to the adjacent Blog line, zero new abstractions. *Cons:* if a third search function is added later, the same omission could recur.
- **Alternative B:** extract a shared `publishedCourseFilter()` helper (or a Mongoose query default/scope) that all course-searching code paths use, so the constraint can't be omitted by a future author. *Pros:* systemic fix. *Cons:* introduces a new abstraction for a two-line problem; disproportionate effort for the size of the bug, and the review burden goes up because it touches a shared helper rather than two obviously-correct inline fixes.
- **Why A is preferred:** the fix is trivial, the risk of a future recurrence is best addressed via a code-review checklist item and a regression test, not a new abstraction layer. Revisit Alternative B only if a third instance of this exact omission is found later.

**Risk Assessment:** Negligible. This can only ever *reduce* the result set (draft courses that shouldn't have been visible stop appearing) — there is no code path where this could hide content that should legitimately be visible, since the catalog and every other public course listing already applies this same filter.

**Rollback Plan:** revert the one-line-per-function change. No data or schema impact.

**Test Plan:**
- **Unit:** none needed beyond the integration test below (this is a query-filter change, not standalone logic).
- **Integration:** create one published and one unpublished course with overlapping search terms; call `/api/search?q=<term>` and `/api/search/courses?q=<term>`; assert only the published course appears in both.
- **Regression:** re-run `tests/search-optimization.test.js` in full — it already asserts index usage via `.explain()`; add one new assertion for the publication filter alongside the existing ones so this doesn't need a new file.
- **Edge cases:** a query that matches only an unpublished course → expect an empty result set, not a 404/error.
- **Negative test:** confirm an authenticated *admin* user still cannot see unpublished courses through this specific endpoint (search is not the intended admin-preview surface — the admin CRUD `list`/`getOne` endpoints remain the correct way to view drafts).
- **Security test:** covered by the integration test above — this *is* the security fix.
- **Performance:** negligible; adding an indexed-or-not equality filter to an already-unindexed regex query does not meaningfully change query cost either way (see DB-1 for the actual indexing fix).

---

### 3. C-1 — Coupon system never redeems or applies a discount

**Problem:** `Coupon.usedCount`/`usedBy` are never written by any code path. `maxUses` is unenforceable, the "already used" guard is a permanent no-op, and no payment-creation path applies `calculateDiscount()` to the charged amount.

**Root Cause:** `validateCoupon` was built as a **pre-checkout preview** endpoint (the frontend calls it to show "this code is valid, here's your discount" before checkout) but the corresponding **redemption** step — the write that actually claims the coupon and reduces the charged amount — was never implemented in any of the three payment-finalization controllers. This reads as an incomplete feature: the validate-only half shipped, the charge-time half did not.

**Affected Files:**
- `backend/controllers/couponController.js` (new function)
- `backend/routes/couponRoutes.js` (no new route needed — redemption is invoked internally by payment finalization, not as a standalone public endpoint)
- `backend/controllers/stripeController.js` (checkout-session creation + webhook finalization)
- `backend/controllers/paymentController.js` (PayPal order creation + `finalizePaypalOrder`)
- `backend/controllers/manualPaymentController.js` (manual payment creation + `reviewManualPayment`)
- `backend/models/Coupon.js` (no schema change — `usedCount`/`usedBy`/`calculateDiscount` already exist)
- `backend/models/Payment.js` / `backend/models/Invoice.js` (add a `couponCode`/`discountApplied` field to record what was actually charged, for audit/support purposes)

**Affected Functions:** `stripeController.js`'s checkout-session creator and `checkout.session.completed`/`invoice.paid` webhook handlers; `paymentController.js`'s `createPaypalOrder`/`finalizePaypalOrder`; `manualPaymentController.js`'s creation handler and `reviewManualPayment`; a new `couponController.redeemCoupon(code, userId, session)` internal helper.

**Design:** introduce one shared, transaction-safe `redeemCoupon()` helper that each of the three payment paths calls **inside their existing Mongo transaction**, immediately before computing the final charge amount:
```js
// couponController.js — illustrative, not applied
export async function redeemCoupon(code, userId, session) {
  if (!code) return { discount: 0 };
  const coupon = await Coupon.findOneAndUpdate(
    { code, active: true, usedCount: { $lt: '$maxUses' /* or precomputed via $expr */ }, 'usedBy.user': { $ne: userId } },
    { $inc: { usedCount: 1 }, $push: { usedBy: { user: userId, usedAt: new Date() } } },
    { new: true, session },
  );
  if (!coupon) throw new AppError(400, 'Coupon is invalid, expired, already used, or fully redeemed');
  return { discount: coupon.calculateDiscount(planAmount), couponId: coupon._id };
}
```
This reuses the exact atomic-claim pattern already proven correct elsewhere in the codebase (`Counter.nextSeq`'s `$inc`+upsert, the payment status-claim guards) — the fix is not a new pattern, it's applying an existing, trusted pattern to a domain that was missed.

**Alternative Designs:**
- **Alternative A (preferred):** atomic `findOneAndUpdate` redemption claim inside each payment transaction, as above. *Pros:* consistent with every other money-adjacent write in this codebase; race-safe by construction (a `maxUses` cap genuinely cannot be exceeded even under concurrent redemption attempts); no new infrastructure. *Cons:* touches three separate controllers, each with its own transaction boundary, so the change must be replicated carefully three times rather than once.
- **Alternative B:** validate-then-write as two separate steps (keep `validateCoupon` as-is for the frontend preview, then do a non-atomic `usedCount < maxUses` check followed by a separate `updateOne` at charge time). *Pros:* smaller diff, doesn't require touching the `findOneAndUpdate` query shape. *Cons:* reintroduces exactly the kind of read-then-write race this codebase has already been careful to avoid everywhere else (see `Counter`, `Payment` status-claims) — two concurrent redemption attempts near the `maxUses` boundary could both pass the check and both succeed, exceeding the cap. This is the same class of bug as `DB-7`'s referral race, which the verification pass already flagged as worth fixing, not worth introducing anew here.
- **Why A is preferred:** this codebase has an established, tested convention for exactly this problem (atomic conditional updates for anything money- or limit-related); deviating from it here would be inconsistent and would reintroduce a race the team has otherwise been disciplined about avoiding.

**Risk Assessment:** Medium-High. This is the riskiest fix in the plan because it touches the charge-amount computation in all three payment-finalization paths, all of which are currently correct and well-tested for the "no coupon" case. A mistake here could cause an incorrect charge amount (either overcharging, undercharging, or double-redeeming a coupon). Mitigation: implement and test one payment path at a time (see Phase 3 PR breakdown — this is *three* separate PRs, not one), each fully covered by its own redemption-round-trip test before moving to the next.

**Rollback Plan:** each payment path's redemption logic is additive (an `if (couponCode)` branch around existing charge logic) and independently revertible per PR. Reverting any one PR restores that path to "coupon-blind" behavior (accepts full price, as today) with no effect on the other two paths or on previously-completed transactions — no data migration or backfill is needed for rollback since `usedCount`/`usedBy` are only ever incremented, never relied upon by other code for anything beyond the guard itself.

**Test Plan:**
- **Unit:** `redeemCoupon()` in isolation — valid code redeems once and returns the correct discount; a second call for the same user+code fails; a call once `usedCount === maxUses` fails; an inactive or expired code fails.
- **Integration:** full checkout round-trip per payment method (Stripe test-mode checkout, PayPal sandbox order, manual-payment submission) with a valid coupon code — assert the **charged amount** reflects the discount (not just that `validateCoupon` reported one), and assert `usedCount`/`usedBy` are updated afterward.
- **Regression:** extend `tests/coupon.test.js` to cover an actual redemption (not just the seeded-`usedBy` check it has today), plus `tests/payment-checkout.test.js`, `tests/paypal-webhook.test.js`, `tests/stripe-webhook.test.js`, `tests/manual-payment.test.js` — all four must remain green for the no-coupon case with zero behavior change.
- **Edge cases:** coupon at exactly `maxUses - 1` (should succeed and become fully used), applicablePlans mismatch (should reject), `minOrderAmount` not met (should reject).
- **Negative test:** two concurrent requests attempting to redeem the last remaining use of a `maxUses`-capped coupon — assert exactly one succeeds and one receives a clear "fully redeemed" error (this is the race-condition regression guard, mirroring `tests/concurrency.test.js`'s existing pattern of firing concurrent requests at a capacity-limited resource).
- **Security test:** attempt to redeem the same coupon twice as the same user in rapid succession (replay) — assert the second attempt is rejected, not double-discounted.
- **Performance:** the added `findOneAndUpdate` is a single indexed lookup (on `code`, already unique) inside an existing transaction — no meaningful latency change to checkout.

---

### 4. SEC-2 — Legacy non-MFA admin path for role/subscription management

**Problem:** `routes/authRoutes.js` exposes `PATCH /users/:id/role` and `PATCH /users/:id/subscription` guarded only by the regular `User` JWT + `adminOnly` + `ipWhitelist` — no TOTP/MFA — running in parallel to the hardened `AdminUser` system.

**Root Cause:** the `AdminUser` + MFA + RBAC system was built as a *migration target*, not a simultaneous replacement — the code's own TODO (`authRoutes.js:30-31`) states these routes exist because the admin frontend hasn't yet been migrated to call the `/api/v1/admin` equivalents. This is deliberate, acknowledged technical debt with a known payoff plan, not an oversight.

**Affected Files:** `backend/routes/authRoutes.js`, `backend/controllers/userAdminController.js`, `backend/routes/v1/admin/usersRoutes.js` (destination), frontend admin console (coordination required, out of this backend plan's direct scope but a hard dependency).

**Affected Functions:** `updateUserRole`, `updateUserSubscription` (both in `userAdminController.js`); the two route registrations in `authRoutes.js`.

**Design (two-stage, given the frontend dependency):**
- **Stage 1 (backend-only, ships without frontend coordination):** add a step-up re-authentication requirement to these two specific routes — require the caller to have completed a fresh MFA check within a short window (e.g., accept the request only if the caller also presents a valid, recently-issued `AdminUser` access token in addition to the `User` session, OR require re-entry of the account password as a lightweight step-up gate). This closes the "stolen cookie = silent privilege escalation" gap without needing the frontend to change its primary call pattern yet.
- **Stage 2 (the real fix, needs frontend coordination):** migrate both routes to live under `/api/v1/admin`, behind the full `AdminUser` + TOTP + RBAC stack, and delete the `authRoutes.js` versions once the admin frontend has cut over. This is the one explicitly flagged as its own coordinated release in the verification report.

**Alternative Designs:**
- **Alternative A (preferred — the two-stage approach above):** ship an interim hardening (Stage 1) immediately, schedule the full migration (Stage 2) as a coordinated release. *Pros:* meaningfully reduces the real-world risk window (a bare stolen cookie is no longer sufficient) without waiting on frontend timeline; the full fix still happens, just not gating everything else. *Cons:* Stage 1 is not a permanent solution, and requires a second wave of work later.
- **Alternative B:** do nothing until the frontend team is ready, and migrate directly to Stage 2 in one shot. *Pros:* avoids building an interim mechanism that will be thrown away. *Cons:* leaves the full severity of the gap live for however long frontend coordination takes (verification report estimated 1-2 days of backend effort, but the actual timeline depends on a team outside this plan's control) — given the gap is "the entire point of MFA is defeated for this privilege class," leaving it fully open for an indeterminate coordination period is not acceptable risk posture for a Critical-adjacent finding.
- **Why A is preferred:** Stage 1 is cheap (a password re-entry check is a small, isolated addition) and meaningfully reduces blast radius immediately; it does not block or complicate Stage 2, which proceeds on its own timeline regardless.

**Risk Assessment:** Stage 1: Low — additive check, does not change the route's existing success-path behavior for a caller who *does* pass the step-up check, so legitimate admin workflows are unaffected apart from one extra prompt. Stage 2: Medium-High — this is the one change in the whole plan that changes a public contract the frontend depends on; must not be merged until frontend is ready to switch, and requires a coordinated deploy window.

**Rollback Plan:** Stage 1 — revert the step-up check addition; routes return to their current (already-existing) behavior, no worse than today. Stage 2 — do not delete the `authRoutes.js` versions until the frontend cutover is confirmed in production; keep both live in parallel for one release cycle as a safety net, then remove the legacy routes in a distinct, later PR once confirmed unused (checked via request logging/metrics on those two endpoints showing zero traffic).

**Test Plan:**
- **Unit:** the step-up check function in isolation — valid re-auth passes, missing/stale re-auth fails with 401/403.
- **Integration:** attempt `PATCH /users/:id/role` with a valid session but no step-up credential → rejected; with both → succeeds as today.
- **Regression:** `tests/admin-rbac.test.js`, `tests/admin-authorization-consolidation.test.js` must remain green.
- **Edge cases:** step-up credential that is valid but expired; step-up credential for a *different* admin than the session owner (must be rejected).
- **Negative test:** attempt privilege escalation to `role: 'admin'` using only a stolen/replayed session cookie with no step-up — must fail post-fix (this is the direct regression test for the vulnerability).
- **Security test:** confirm the step-up requirement cannot be bypassed by any parameter/header manipulation; confirm rate-limiting still applies to repeated step-up attempts (brute-force resistance).
- **Performance:** negligible — one additional check per request to two low-traffic admin endpoints.

---

### 5. DB-1 — Unanchored regex search, no text index (DoS amplifier)

**Problem:** `globalSearch`, `searchCourses`, `searchTeachers`, and the generic `crudController.list` build unanchored, case-insensitive regex queries against `Course`/`Blog`/`User` collections with no text index anywhere in the schema, forcing a full collection scan on every search request.

**Root Cause:** substring search (matching a query anywhere within a field, not just a prefix) was implemented the straightforward way — a JS-level regex — without an accompanying MongoDB text index, likely because the collections were small during initial development and the cost wasn't visible. The codebase's own test comments already acknowledge this is unaddressed.

**Affected Files:** `backend/models/Course.js`, `backend/models/Blog.js`, `backend/models/User.js` (schema-level index additions), `backend/controllers/searchController.js` (query rewrite).

**Affected Functions:** `globalSearch`, `searchCourses`, `searchTeachers`.

**Design:** add a MongoDB compound text index to each searched model (`{title:'text', description:'text', tags:'text'}` for Course; equivalent for Blog; `{name:'text', specialization:'text', bio:'text'}` for User), and switch the three search functions from `new RegExp(...)` matching to `$text: {$search: q}` with `{score: {$meta:'textScore'}}` sorting. Keep the existing `published`/`role` equality filters unchanged (already correctly indexed and, post-DB-2, correctly applied).

**Alternative Designs:**
- **Alternative A (preferred):** native MongoDB text indexes + `$text` queries. *Pros:* no new infrastructure, works within the existing Atlas tier, index build is a one-time background operation (`background: true`/online index build on Atlas), directly solves the COLLSCAN problem. *Cons:* MongoDB's native text search has weaker relevance ranking and no typo-tolerance compared to a dedicated search engine.
- **Alternative B:** Atlas Search (Lucene-based, available on M10+ Atlas clusters). *Pros:* significantly better relevance, fuzzy matching, and can be scaled independently of the primary database's write capacity. *Cons:* requires a paid Atlas tier upgrade (the audit noted the current tier constraints), an additional configuration surface (search index definitions live in Atlas, not just in Mongoose schema), and is a larger, slower change to land safely.
- **Why A is preferred:** it directly and immediately fixes the confirmed DoS-amplification risk within the current infrastructure, with a same-week implementation timeline. Recommend Atlas Search as a **P2/P3 follow-up** once traffic/relevance requirements actually justify the infrastructure upgrade — don't block the urgent fix on a tier-upgrade decision that involves cost and infra planning outside this plan's scope.

**Risk Assessment:** Medium. Building a text index on existing collections is an online, non-blocking operation on MongoDB Atlas (does not lock the collection for reads/writes), but it does consume additional disk/RAM for the index and should be done during a lower-traffic window and monitored. The query rewrite from regex to `$text` changes matching semantics subtly (word-boundary/stemmed matching vs. raw substring matching) — this could change which results appear for some queries, which is a user-visible behavior change that needs product sign-off, not just an engineering review.

**Rollback Plan:** the index addition itself is non-destructive and can remain even if the query change is reverted (an unused index is harmless, just reclaim it later via `dropIndex` if truly abandoned). The query-logic revert is a straightforward code revert back to the regex form; do not drop the new index in the same rollback step — treat index cleanup as a separate, deliberate follow-up decision if the `$text` approach is ultimately not kept.

**Test Plan:**
- **Unit:** none beyond integration (this is a query-construction change).
- **Integration:** seed a moderate-sized (thousands of documents) test collection, run representative search queries, and assert both correctness (expected documents appear) and that `.explain('executionStats')` shows `IXSCAN`/text-index usage, not `COLLSCAN` — extending the existing pattern in `tests/search-optimization.test.js`.
- **Regression:** re-run `tests/search-optimization.test.js` in full; must remain green, and gains new assertions rather than losing old ones.
- **Edge cases:** empty query string, single-character query, query containing special regex-significant characters (should behave sanely under `$text`, which doesn't need the escaping the current regex approach requires), non-Latin-script query text (Arabic course titles — confirm `$text` handles this correctly given the site's bilingual content, this is a real product requirement, not a hypothetical).
- **Negative test:** confirm the DoS-amplification characteristic is actually gone — issue a burst of search requests with short query strings and confirm via `.explain()` or query-time measurement that each is now an indexed lookup, not a full scan.
- **Security test:** covered by the above — this fix's entire purpose is closing a DoS vector.
- **Performance checks:** before/after query-latency comparison on a realistic data volume; confirm index build does not measurably degrade write throughput on the affected collections during the build window (Atlas builds indexes in the background by default on replica sets, but this should be explicitly confirmed for the specific Atlas tier in use, not assumed).

---

### 6. REL-1 — Renewal-reminder cron has no scheduler in-repo

**Problem:** the `GET /api/cron/renewal-reminders` endpoint is well-built and `CRON_SECRET`-authenticated, but nothing committed to this repository ever calls it — no GitHub Actions `schedule:` trigger, no documented external scheduler configuration.

**Root Cause:** the endpoint was built expecting an *external* scheduler to be configured directly against the Render dashboard/a third-party uptime service, per the inline comment in `render.yaml` — but "configure an external dashboard" is inherently not version-controlled, not code-reviewed, and not verifiable by anyone reading only the repository, which is exactly why the verification pass could not confirm whether the reminder ever fires in practice.

**Affected Files:** new file `.github/workflows/cron-renewal-reminders.yml`; no application code changes required.

**Affected Functions:** none (this is a scheduling/infrastructure fix, not a code fix) — the existing `sendRenewalReminders` handler in `cronController.js` is unchanged.

**Design:** add a GitHub Actions workflow with a `schedule: - cron: '0 9 * * *'` trigger that performs an authenticated `curl`/`fetch` call to the production Render URL with the `CRON_SECRET` bearer token (stored as a GitHub Actions secret, not committed). This makes the dependency version-controlled, auditable in CI run history, and independently alertable (a failed GitHub Actions run itself can notify via GitHub's own workflow-failure notifications).

**Alternative Designs:**
- **Alternative A (preferred):** GitHub Actions scheduled workflow. *Pros:* free, lives in the same repo as the code it triggers (discoverable, version-controlled, code-reviewed), gives a built-in failure-notification mechanism via GitHub's own tooling, requires no new third-party account. *Cons:* GitHub Actions scheduled workflows can be delayed by a few minutes under platform load (acceptable for a once-daily reminder, not acceptable for sub-minute-precision jobs, which this isn't).
- **Alternative B:** a third-party uptime/cron service (UptimeRobot, cron-job.org) configured directly, as the `render.yaml` comment originally suggested. *Pros:* purpose-built for this, typically has its own alerting/dashboard. *Cons:* configuration lives outside the repository, is not code-reviewed, is not visible to anyone auditing this codebase (which is precisely the gap this finding identifies) — using this approach again would just reproduce the original problem in a different, still-invisible tool.
- **Why A is preferred:** it directly resolves the "unverifiable from source" concern that is the actual substance of this finding, at zero additional cost or new-vendor risk.

**Risk Assessment:** Low. This is purely additive infrastructure; it does not change any application code and cannot regress existing behavior. The only risk is a misconfigured secret or URL causing the workflow to fail silently — mitigated by the test plan below.

**Rollback Plan:** delete the workflow file. The cron endpoint itself is unaffected and continues to work exactly as it does today if called by any means.

**Test Plan:**
- **Unit:** n/a (infrastructure config, not application code).
- **Integration:** manually trigger the workflow via `workflow_dispatch` (add this trigger alongside `schedule:` for testability) against a staging/test environment first, confirm the endpoint receives the call and returns 200.
- **Regression:** confirm `tests/cron.test.js` (which tests the endpoint's own logic) is unaffected — this change never touches application code.
- **Edge cases:** what happens if the workflow fires while a previous invocation is still running (overlap) — this is exactly `DB-8`'s finding; the cron scheduler fix and the cron idempotency fix (`DB-8`) should land in that order (idempotency first) so that even an accidental double-fire from this new scheduler is already safe.
- **Negative test:** confirm the workflow fails (and is visible as a failed run) if `CRON_SECRET` is wrong or missing — proving the auth path is actually being exercised, not silently bypassed.
- **Security test:** confirm the secret is stored as a GitHub Actions encrypted secret, never appears in workflow logs (mask it explicitly), and the workflow file itself contains no hardcoded credential.
- **Performance:** n/a.

---

### 7. SEC-DEP — `nodemailer` High-severity CVE (GHSA-p6gq-j5cr-w38f)

**Problem:** the installed `nodemailer@9.0.0` is vulnerable to a message-level `raw` option bypass enabling SSRF/arbitrary file read (CVSS 7.1).

**Root Cause:** a dependency-level vulnerability disclosed after the version was pinned; not a defect introduced by this codebase's own code.

**Affected Files:** `backend/package.json`, `backend/package-lock.json`.

**Affected Functions:** none in this codebase — confirmed by a repo-wide grep in this planning phase that the vulnerable `raw` send option is **never used** anywhere the codebase calls `sendMail` (`config/mailer.js`, and every controller that sends email: `authController`, `certificateController`, `contactController`, `cronController`, `enrollmentController`, `liveClassController`, `manualPaymentController`, `trialController`). This means the vulnerability is present in the dependency tree but not currently reachable through this application's own usage pattern — still worth fixing immediately (it's free and instant), but not an active, exploited-today path.

**Design:** bump `nodemailer` to `9.0.3` (confirmed via `npm outdated` in this planning phase to be both the "wanted" and "latest" version — a pure patch-level bump within the same major version, no API changes expected).

**Alternative Designs:**
- **Alternative A (preferred):** `npm install nodemailer@9.0.3` (or update the `package.json` semver range and run `npm install`/`npm ci` to regenerate the lockfile). *Pros:* trivial, same-major-version patch, zero code changes needed. *Cons:* none identified.
- **Alternative B:** pin to an even newer nodemailer major if one exists and offers additional hardening. *Cons:* unnecessary risk for zero additional benefit — 9.0.3 is confirmed as the current latest release in the 9.x line, and there is no evidence a major-version jump is needed to close this specific advisory.
- **Why A is preferred:** it's the minimal change that closes the advisory.

**Risk Assessment:** Negligible. Patch-version bump within the same major, no application code touches the changed surface (`raw` option), confirmed by grep.

**Rollback Plan:** revert the `package.json`/`package-lock.json` change; reinstall. No data or runtime-state impact.

**Test Plan:**
- **Unit/Integration:** re-run the full existing email-related test coverage (`tests/cron.test.js` and any test exercising `sendMail` via `authController`/`contactController`/`trialController` paths) — must remain green, proving the patch bump doesn't change observable email-sending behavior.
- **Regression:** full `node --test` suite run (this is a dependency bump, the safest possible verification is "does everything still pass").
- **Edge cases:** n/a — no logic change.
- **Negative test:** re-run `npm audit` after the bump and confirm zero vulnerabilities remain.
- **Security test:** the `npm audit` re-run above is the security test.
- **Performance:** n/a.

---

### 8. SEC-6 — Unescaped user input in HTML emails

**Problem:** `emailTemplates.js`'s `row()` helper does not escape interpolated values; several templates (trial requests, manual-payment admin/approval/rejection emails) pass raw user input into HTML email bodies, while others correctly use the file's own `esc()` helper.

**Root Cause:** `esc()` was added at some point (likely alongside the templates that use it correctly) but was never retrofitted into `row()` itself or into the templates built before/without it — an incomplete rollout of a security fix that exists in the same file, not a missing capability.

**Affected Files:** `backend/config/emailTemplates.js`

**Affected Functions:** `row()`, `trialRequestAdminEmail`, `manualPaymentAdminEmail`, `manualPaymentApprovedEmail`, `manualPaymentRejectedEmail`, `trialRequestStudentEmail`

**Design:** make `row()` escape by default (call `esc()` internally on its `value` argument before interpolating), so every caller is protected without needing to remember to do it themselves — the same "safe by default" principle recommended as the systemic fix for SEC-1.

**Alternative Designs:**
- **Alternative A (preferred):** escape inside `row()` itself. *Pros:* fixes all five listed call sites (and any future ones) in a single, small, centrally-reviewable change; matches the existing `esc()`-using templates' behavior exactly, so no visual/output change for those. *Cons:* if any caller was relying on `row()` to pass through *intentional* HTML (unlikely, and not found in this codebase), it would need updating — verify by reading every `row()` call site before merging (this is a small enough file to check exhaustively).
- **Alternative B:** update each of the five affected templates individually to wrap their interpolated values in `esc()`, leaving `row()` unescaped. *Pros:* more surgical, touches exactly the currently-broken call sites and nothing else. *Cons:* leaves the underlying footgun in place for any future template — the same "forgot to escape" mistake could recur, since `row()` itself remains unsafe by default.
- **Why A is preferred:** centralizing the fix in `row()` closes the vulnerability class, not just today's five instances, and the verification pass already confirmed no call site needs raw HTML passthrough.

**Risk Assessment:** Low. Output for the already-correct templates (which today double-escape nothing, since they call `esc()` explicitly and `row()` doesn't) needs a quick check — if `row()` starts escaping internally, any template that *also* calls `esc()` before passing a value in would double-escape (e.g., `&amp;amp;` instead of `&amp;`). This must be checked and those explicit `esc()` calls removed from callers once `row()` handles it internally, or the fix should only touch `row()`'s *default* behavior for values not already pre-escaped — the implementation must audit all `esc()` call sites as part of this change to avoid double-escaping, which is the one non-trivial part of an otherwise simple fix.

**Rollback Plan:** revert `row()` to its unescaped form; revert any de-duplicated `esc()` calls removed from callers during the fix. Purely template-rendering logic, no data/state impact — a bad email render is the worst-case failure mode, not a crash or data-loss.

**Test Plan:**
- **Unit:** call `row()` directly with a value containing `<script>`/`&`/`"` and assert the output is escaped; call each of the five previously-broken template functions with a malicious-looking name/message field and assert the rendered HTML contains no unescaped `<`/`>`/`&`.
- **Integration:** trigger an actual trial-request submission and manual-payment flow with a deliberately HTML-injection-shaped input in a free-text field (e.g., name = `<a href="evil">click</a>`), capture the rendered email HTML (via the existing test mailer mock, not a real send), assert it renders as literal text, not a link.
- **Regression:** re-run any existing test that snapshots or asserts on rendered email content for the *already-correct* templates (`enrollmentAdminEmail`, `contactAdminEmail`, etc.) to confirm no double-escaping was introduced.
- **Edge cases:** empty string, `null`/`undefined` value (the `row()` helper already has a `|| '—'` fallback — confirm this still works post-fix), a value that is itself the literal string `&amp;` (must not become `&amp;amp;amp;`).
- **Negative test:** the injection-payload integration test above **is** the negative test.
- **Security test:** same as above; this is fundamentally a security-classed fix.
- **Performance:** negligible — `esc()` is a cheap string-replace operation.

---

### 9. REL-3 — `exitOnError:false`, no explicit crash-exit handler

**Problem:** Winston is configured with `exitOnError:false`, and `server.js` registers only `SIGTERM`/`SIGINT` handlers — no `process.on('uncaughtException'|'unhandledRejection')` that forces a clean exit, so a truly unexpected synchronous throw outside Express's request/response cycle could leave the process running in a degraded state.

**Root Cause:** `exitOnError:false` was very likely chosen deliberately to prevent Winston's *own* internal logging errors from crashing the process (a reasonable, narrow intent), but its effect is broader than that — it also suppresses Winston's default behavior of exiting after logging any uncaught exception, and nothing else in the codebase fills that gap.

**Affected Files:** `backend/server.js` (the fix site); `backend/config/logger.js` (context only, no change required).

**Affected Functions:** none currently exist for this purpose — this is a net-new addition to `server.js`, alongside the existing `shutdown()` function.

**Design:** add explicit `process.on('uncaughtException', ...)` and `process.on('unhandledRejection', ...)` handlers in `server.js` that log the error via the existing `logger` and then call the existing `shutdown('uncaughtException')` path (reusing the graceful-drain-then-exit logic already proven correct for `SIGTERM`/`SIGINT`, rather than an abrupt `process.exit(1)`).

**Alternative Designs:**
- **Alternative A (preferred):** explicit handlers in `server.js` that funnel into the existing `shutdown()` function. *Pros:* reuses already-tested, already-correct drain logic; consistent single exit path for every "the process needs to stop" reason (signal or crash); minimal new code. *Cons:* none significant.
- **Alternative B:** simply flip `exitOnError:true` in `logger.js` and rely on Winston's built-in exit-after-log behavior. *Pros:* one-line change. *Cons:* Winston's built-in exit is an abrupt `process.exit()`, not a graceful drain — in-flight requests (including, worst case, a payment finalization mid-transaction) would be cut off rather than allowed to finish or safely fail, which is exactly the failure mode `server.js`'s existing graceful-shutdown logic was built to prevent for the signal-based case.
- **Why A is preferred:** it extends the same safety guarantee the team already built for deploy-time shutdowns to the crash case, rather than introducing a second, less-safe exit path for a different trigger.

**Risk Assessment:** Low-Medium. The main risk is scope: an `uncaughtException` handler must not become a way to "recover and continue" (that would defeat its purpose and risk worse corruption) — it must always terminate the process after logging, per Node.js's own documented guidance that continuing after an uncaught exception is unsafe. Care must be taken that the handler itself cannot throw (e.g., if `logger.error()` itself somehow fails) and cause an infinite loop or unhandled crash-in-the-crash-handler.

**Rollback Plan:** remove the two `process.on()` registrations; process reverts to today's behavior (log-and-continue) as a straightforward code revert with no state impact.

**Test Plan:**
- **Unit:** cannot meaningfully unit-test `process.on('uncaughtException')` in isolation without spawning a child process (standard limitation) — test via an integration-style child-process test instead.
- **Integration:** spawn the server as a child process, trigger a deliberate uncaught exception via a test-only endpoint or injected fault, assert the process logs the error and exits within the expected shutdown-timeout window (reusing the existing 10-second force-exit ceiling from `shutdown()`).
- **Regression:** confirm `SIGTERM`/`SIGINT` shutdown behavior (already tested, if there's existing coverage — if not, this is a good moment to add a matching test) is unaffected by the new handlers.
- **Edge cases:** an unhandled promise rejection (not a synchronous throw) must be caught by the `unhandledRejection` handler specifically, confirm both are wired, not just one.
- **Negative test:** confirm a *handled* exception (one caught by `asyncHandler`/`errorHandler` in the normal request flow) does **not** trigger this new process-exit path — it must only fire for genuinely uncaught errors, not the routine error-handling path the app already uses correctly.
- **Security test:** n/a directly, though this closes an availability-adjacent gap (a degraded-but-alive process staying in Render's rotation).
- **Performance:** negligible — these are one-time process-level event listeners, not per-request overhead.

---

### 10. REL-4 — No metrics/APM/alerting; health check blind to DB state

**Problem:** no metrics/APM tooling exists anywhere in the backend; Render's configured health check watches `/health` (liveness-only, no DB check) rather than `/ready` (which correctly detects a dropped DB connection), so a DB outage would not trigger an automatic instance cycle or any alert.

**Root Cause:** `/health` vs `/ready` was correctly designed as two different probes for two different purposes, but the *deployment configuration* (`render.yaml`'s `healthCheckPath`) was pointed at the wrong one for the failure mode this finding is concerned with — this is a configuration gap, not a code defect, and metrics/alerting were simply never built out for this project's current size.

**Affected Files:** `render.yaml` (health check path); no application code change required for the health-check portion. A new `/metrics` endpoint (optional, see Alternative B) would touch `backend/app.js`.

**Affected Functions:** none for the `render.yaml` fix; the existing `/health` and `/ready` handlers in `app.js` are unchanged.

**Design (two independent, non-conflicting improvements):**
1. Point an **external** uptime monitor (not Render's own health check, which only supports one path per service and is also used for basic liveness/restart decisions that shouldn't be coupled to a transient DB blip) at `/ready`, with real alerting (email/SMS/Slack webhook) configured on that monitor.
2. Optionally, add a `prom-client`-based `/metrics` endpoint for request-latency and error-rate visibility, scraped by an external Prometheus-compatible service if/when the team adopts one.

**Alternative Designs:**
- **Alternative A (preferred for the immediate fix):** external uptime monitor on `/ready` + real alerting, no code change. *Pros:* zero deployment risk, addresses the most urgent gap (nobody finds out about a DB outage) immediately and cheaply. *Cons:* doesn't give latency/throughput visibility, only up/down.
- **Alternative B (recommended as a P2 follow-up, not blocking):** add `/metrics` with `prom-client`. *Pros:* real observability into performance trends, not just binary up/down. *Cons:* requires choosing and standing up a scraping/dashboard target (Grafana Cloud, a hosted Prometheus, etc.) which is an infrastructure decision beyond this backend codebase's scope, and is a larger, slower-to-land change.
- **Why A is preferred as the immediate step:** it closes the "nobody would notice a DB outage" gap this week, with no code change and no deployment risk, while B is scheduled as separate, larger follow-on work.

**Risk Assessment:** Negligible for Alternative A (pure external configuration, no code touched). Low-Medium for Alternative B if pursued later (a new endpoint, but additive and easily feature-gated).

**Rollback Plan:** Alternative A — remove/reconfigure the external monitor; no code to revert. Alternative B (if pursued) — remove the `/metrics` route; additive-only, no state impact.

**Test Plan:**
- **Unit/Integration:** none required for Alternative A (external config only) — verification is operational: confirm the monitor actually fires an alert during a simulated `/ready` 503 (e.g., temporarily point the monitor at a staging environment and force a DB disconnect to confirm the alert path end-to-end).
- **Regression:** confirm `tests/ready-endpoint.test.js` and `tests/health.test.js` remain green — this change touches deployment configuration, not the endpoints themselves.
- **Edge cases:** confirm the monitor's failure threshold (e.g., "alert after 2 consecutive failures") is tuned to avoid false-positive alerts from a single transient network blip, while still catching a real sustained outage promptly.
- **Negative test:** confirm the monitor does *not* alert during a normal deploy-time restart (a brief `/ready` unavailability during redeploy is expected and should not page anyone if it self-resolves within the configured threshold).
- **Security test:** n/a.
- **Performance:** n/a for Alternative A; for Alternative B, confirm the `/metrics` endpoint itself doesn't become a scraping-load concern (standard `prom-client` overhead is negligible, but this is worth a quick check under the app's expected scrape interval).

---

### 11. REL-2 — 14 of 32 controllers have no direct test coverage

**Problem:** the content/engagement CRUD surface (blog, certificates, contact, live classes, messaging, notifications, parent endpoints, progress, Quran bookmarks/memo, reviews, subscribers, trials, wishlists, hifz) has zero direct test coverage, while auth/payments/admin/search are well covered.

**Root Cause:** test coverage was clearly prioritized around the highest-risk domains first (money, auth, admin) — a reasonable sequencing decision, not a process failure — but was never circled back to for the remaining, lower-initial-risk-but-still-user-facing controllers.

**Affected Files:** new test files under `backend/tests/` — no application code changes.

**Affected Functions:** n/a (test-writing, not a fix to existing logic) — though writing these tests is highly likely to *surface* additional latent bugs in the untested controllers, which would then become their own separate findings/PRs rather than being silently fixed as a side effect of test-writing.

**Design:** add test files incrementally, prioritized by authorization-boundary risk (per the verification report's own recommendation): `reviewController`, `messageController`, `notificationController`, `wishlistController`, `parentController` first, then the remainder.

**Alternative Designs:**
- **Alternative A (preferred):** incremental, risk-prioritized test-writing as ongoing/parallel work, not a release gate. *Pros:* doesn't block the Critical/High fixes above on a multi-day test-writing effort; delivers value continuously. *Cons:* coverage remains incomplete for a while.
- **Alternative B:** treat this as a blocking pre-release gate — no fixes ship until all 14 controllers have coverage. *Pros:* maximizes safety net before touching anything else. *Cons:* this is disproportionate — most of the Critical/High fixes above touch different files entirely (payments, search, admin routes) and don't depend on these 14 controllers being tested first; gating everything on this would delay genuinely urgent security/correctness fixes for days with no direct risk-reduction benefit to those specific fixes.
- **Why A is preferred:** sequence this as parallel, ongoing work (see Phase 3 for how it's folded into the PR queue) rather than a blocking prerequisite.

**Risk Assessment:** Negligible — writing tests cannot regress production behavior (it can only reveal, not cause, bugs). The only "risk" is that new tests might reveal an existing bug in one of these controllers, which would then need its own triage — a good outcome, not a risk.

**Rollback Plan:** n/a — test-only additions; reverting a test PR simply removes test coverage, does not affect production code.

**Test Plan:** this finding's fix *is* the test plan. For each of the 5 initial priority controllers: cover the happy path, the authorization boundary (e.g., can a student read another student's reviews/messages/notifications — must be denied), input validation edge cases, and at least one negative test per authenticated route (missing/invalid auth token).

---

### 12–22. Remaining Medium-tier findings (ARCH-3, SEC-3, DB-8, DB-9, ARCH-6, SEC-5, DB-5, DB-3, ARCH-3v, ARCH-5, REL-5)

To keep this document proportional, the remaining Medium-tier findings are presented in table form — each still receives every required field, just formatted for density given their lower individual risk relative to items 1–11 above.

| Finding | Problem | Root Cause | Affected Files/Functions | Design (preferred) | Alternative (rejected, why) | Risk | Rollback | Test Plan (condensed) |
|---|---|---|---|---|---|---|---|---|
| **ARCH-3** validation opt-in | `handleValidationErrors` must be called manually per-controller; only 7/32 do | No route-level validation middleware exists; enforcement was left to each handler's discipline | `utils/validationHelper.js`; all route files with `express-validator` arrays | Add a reusable `validate` middleware appended after each validator array at the route level; remove per-handler calls | Leave as-is and rely on code review discipline — rejected: exactly the kind of gap that produces a silent-acceptance bug the moment a new author doesn't know the convention | Medium — touches every mutating route's middleware chain, must verify none currently rely on partial/no enforcement as intentional behavior | Revert the middleware addition per-route; each route reverts independently since the change is additive per route file | Re-run full validation-related test suite (`tests/validation-error-contract.test.js`, `auth-request-validation.test.js`) after each route's migration; add one new test per migrated route confirming a previously-silent invalid payload is now rejected |
| **SEC-3** financialGuard unwired | Kill-switch middleware defined, never applied; wouldn't work as-is (`req.adminUser` vs `req.user` mismatch) | Built for the `AdminUser` stack, but the route it should protect (`reviewManualPayment`) still lives on the legacy `User`-JWT stack | `middleware/maintenanceGuard.js`, `routes/paymentRoutes.js` → migrate to `routes/v1/admin` | Bundle with SEC-2 Stage 2 migration (same root cause: legacy route on the wrong auth stack) | Patch `financialGuard` to also accept `req.user.role==='admin'` as a stopgap — rejected: this reintroduces the exact non-MFA weakness SEC-2 is trying to close, just for a different guard | Low once bundled with SEC-2 Stage 2; do not fix in isolation before that migration | Revert alongside SEC-2 Stage 2's rollback plan | Confirm `financials_frozen` toggle actually blocks `reviewManualPayment` post-migration; confirm it does NOT block read-only admin views |
| **DB-8** cron dedup races | Renewal cron reads dedup marker from a stale snapshot, writes back non-atomically; weekly report has no marker at all | Both jobs were written assuming single, non-overlapping invocations — a reasonable assumption until REL-1's scheduler fix makes overlap possible for the first time via automated retries | `controllers/cronController.js` → `sendRenewalReminders`, `sendWeeklyParentReports` | Atomic claim: `updateOne({_id, 'subscription.renewalReminderSentFor':{$ne:validUntil}}, {$set:{...}})`, only send if `modifiedCount===1`; add an equivalent per-parent weekly marker | Add a distributed lock (e.g., Redis-based mutex) around the whole cron run — rejected: disproportionate infrastructure for a problem an atomic per-document claim already solves cleanly, and introduces a new failure mode (lock never released) | Low — same atomic-claim pattern already proven elsewhere in this codebase | Revert to the non-atomic form; worst case reintroduces the (rare) duplicate-email race, no data loss | Fire two concurrent invocations of each cron handler in a test and assert exactly one email is sent per recipient |
| **DB-9** unbounded getConversation | Entire message history returned on every conversation open, no pagination | Reasonable when threads were short; never revisited as a scaling concern | `controllers/messageController.js` → `getConversation` | Cursor-based pagination (`createdAt`/`_id` cursor), newest-first, default page size matching the app's existing pagination conventions | Offset/skip-based pagination — rejected: `skip()` is O(n) on large collections, exactly the anti-pattern the DB audit flagged elsewhere; a cursor is the already-established better practice | Low — additive query parameter, default behavior (no params) can match today's "recent messages" expectation if the frontend isn't ready for cursor params yet | Revert to unbounded query; no data impact, only a return to the prior performance characteristic | Seed a long conversation (1000+ messages), assert paginated response size and correct cursor behavior; confirm existing message-thread UI still functions with the new default page size |
| **ARCH-6** pagination envelope inconsistency | `couponController.listCoupons` and `contactController.getContacts` hand-roll `{X,total,page,pages}` instead of using `sendPaginated`'s `{data,total,page,pages}` | Written before or without awareness of the shared helper | `controllers/couponController.js`, `controllers/contactController.js`, `utils/pagination.js` | Route both through `sendPaginated`; update the two frontend consumers' expected response key from `coupons`/`contacts` to `data` in the same coordinated change | Keep the divergent envelope and document it as an intentional exception — rejected: there's no functional reason for the divergence, it's pure historical accident, and normalizing removes a frontend special-case | Medium — this is the one item in this table with a **required frontend coordination** dependency (response shape changes) | Revert the controller change; frontend reverts its key-name expectation in the same rollback | Contract test asserting response shape for both endpoints matches `sendPaginated`'s output; manual/E2E check that the admin coupon list and contact list UI still render post-change |
| **SEC-5** CORS regex too broad | `/^https:\/\/alrahma-[a-z0-9-]+\.vercel\.app$/` matches any attacker-registered `alrahma-*.vercel.app` project | Regex written to match Vercel's preview-URL pattern loosely, without pinning to the actual project/team scope | `backend/app.js` | Tighten the regex to the actual Vercel preview format including project ID/team scope, or maintain an explicit allowlist of known preview origins | Remove wildcard preview-origin support entirely, only allow the production origin — rejected: breaks the legitimate use case of testing preview deployments cross-origin, which the team evidently relies on | Low — verification confirmed practical exploitability is already low due to `sameSite=lax`; this is defense-in-depth, not an urgent gap | Revert to the broader regex; no functional loss beyond the (already low) defense-in-depth benefit | Test that a request from a legitimate `alrahma-<preview-hash>.vercel.app` origin still succeeds; test that an attacker-controlled `alrahma-evil.vercel.app` origin is now rejected |
| **DB-5** view-counter write-on-read | `getPost` does `$inc` on every read; no cache header, unlike the list endpoint | View counting and cacheability were never reconciled as competing requirements | `controllers/blogController.js` → `getPost` | Decouple: fire-and-forget the `$inc` (don't await it in the response path) and add a short `Cache-Control` header to the read itself | Batch view-counting in Redis and flush periodically to Mongo — rejected as the *first* fix: more infrastructure than the problem currently warrants; revisit only if fire-and-forget alone proves insufficient at higher traffic | Low — the `$inc` becoming fire-and-forget slightly changes error-handling (a failed view-increment no longer affects the read response, which is the intended improvement, not a regression) | Revert to the awaited `$inc` + no cache header | Load-test a single popular post's read endpoint before/after, confirming reduced write contention and now-cacheable response headers |
| **DB-3** getContacts N+1 (bounded, teacher-only) | 2N queries per teacher's contact list; bounded to N=1 for students | Written per-contact rather than batched, following the same pattern the sibling `getMyStudents` was later refactored away from | `controllers/messageController.js` → `getContacts` | Two `$group` aggregations keyed by contact, mirroring `teacherController.getMyStudents`'s already-proven pattern | Leave as-is given it's indexed/bounded — rejected as the long-term answer since teacher rosters can grow, but acceptable to deprioritize below all Critical/High items given confirmed low current impact | Low — same pattern already validated elsewhere in this codebase | Revert to the per-contact query loop | Compare query count before/after for a teacher with a large roster (e.g., 50+ students) using the test DB's query-count instrumentation |
| **ARCH-3v** versioning inconsistency | 26 route groups unversioned under `/api/*`; only `/api/v1/admin` is versioned | Admin surface was hardened and versioned as part of a dedicated security pass; public API was never retrofitted to match | `backend/app.js` | Introduce `/api/v1/*` mounts for public routes while keeping unversioned aliases live during a transition window | Version only new routes going forward, leave existing ones alone — rejected: perpetuates the exact inconsistency this finding flags, just freezes it in place rather than resolving it | Medium — requires frontend to eventually adopt versioned paths, though old paths can coexist during transition | Remove the `/v1` aliases; unversioned paths remain fully functional throughout | Contract test confirming both versioned and unversioned paths return identical responses during the transition period |
| **ARCH-5** two error-response idioms | `throw` (after pre-setting `res.statusCode`) vs. `return res.status().json()` coexist, sometimes in the same handler | Organic growth without a documented convention | Repo-wide across controllers | Standardize on `return res.status(x).json({message})` (the more explicit, less side-channel-dependent of the two) repo-wide | Standardize on the throw-based idiom instead — rejected: relying on a pre-set `res.statusCode` read later by `errorHandler` is a side-channel that's easier to get wrong (e.g., forgetting to set it before throwing) than an explicit return | Low — purely mechanical, same `{message}` output shape either way | Revert per-file if any individual conversion introduces an issue; changes are independent per controller | Full regression suite run after each controller's conversion (mechanical refactor, verified by existing tests continuing to pass with zero test-file changes needed) |
| **REL-5** rate-limit hits not logged distinctly | `limiter()` sets `message` but no `handler` callback for structured logging | Never built out beyond the minimum functional requirement | `config/rateLimit.js`, `config/adminRateLimits.js` | Add a `handler` callback that logs a distinct warn-level event (`{prefix, ip, path}`) before sending the 429 | Rely on the generic request logger's existing warn-level 429 line — rejected as insufficient: it's not labeled distinctly enough to build abuse-pattern alerting on top of, which is the actual goal | Negligible — additive logging only | Remove the `handler` callback | Trigger a rate limit in a test, assert the new distinct log event is emitted with expected fields |

---

### Batch L — Low-tier backlog

The following are individually trivial or already-accepted as-is; each still receives its own tiny PR in Phase 3 (per the "no PR combines unrelated fixes" rule), but does not warrant the full seven-part treatment given their negligible individual risk profile.

| Finding | Fix | Effort | Note |
|---|---|---|---|
| SEC-4 | Enforce ≥32-byte minimum length on `JWT_SECRET`/`ADMIN_JWT_ACCESS_SECRET` in `validateEnv.js` | Low | Fails startup, not runtime — zero production-request risk |
| SEC-L2 | Add per-account failed-login lockout to `User`, mirroring `AdminUser`'s existing 5-attempt lock | Low-Medium | Genuine hardening, deprioritized because per-IP limiting already exists |
| SEC-L3 | No code fix — operational: confirm `REDIS_URL` is actually set in the Render production environment | N/A (config check) | Verify, don't code |
| SEC-L4 | Accepted as-is — verification confirmed idempotency + userId-binding make this genuinely low-risk | None | No fix planned |
| SEC-L5 | Add email-verification-on-register and require `currentPassword` for email changes | Medium | Real gap, but no active exploitation path found; schedule as P3 |
| DB-4 | Port `teacherController.getMyStudents`'s aggregation pattern to `parentController.getChildren` | Low | Same fix pattern as DB-3, can ship in the same PR as DB-3 given identical root cause and fix shape |
| DB-6 | Convert `awardXP`/`toggleProgress` to `$inc`/`$addToSet` where prior validation logic allows | Medium | Narrow same-user race only; low urgency |
| DB-7 | Wrap `Referral.create` in a try/catch for `E11000` → return existing; backfill `referralCode` to remove the legacy scan | Low | Two independent sub-fixes, likely two tiny PRs |
| DB-L3 | No fix — monitor only | N/A | Revisit only if course sizes grow unusually large |
| DB-L4 | Change `.select('...thumbnail')` to `.select('...icon')` in `searchCourses` | Trivial | One-word fix |
| DB-L5 | No fix — accepted as correct for an always-on Render process | N/A | |
| ARCH-L1 | Optional rename for grep-clarity only (e.g. `contactController.getContacts` → `getContactSubmissions`) | Low | Purely cosmetic, no functional change; low priority, easy to defer indefinitely |
| ARCH-L2 | Document the two handler-wrapping conventions in a short contributor note; no code change mandatory | N/A | Convention documentation, not a code fix |
| ARCH-L3 | Add an optional `beforeRemove`/`removeStrategy` hook to `crudController.js`'s factory | Medium | Touches the shared factory — sequence carefully, low urgency |
| REL-L1 | No fix — Dockerfile not needed given Render's native buildpack | N/A | |
| REL-L2 | Add a coverage threshold and a Node-version matrix (`[20, 22]`) to `ci.yml` | Low | |
| REL-L3 | Same underlying fact as REL-4 — no separate fix needed once REL-4 ships | N/A | |

---

## Phase 3 — Pull Request Strategy

Each PR is single-purpose. Merge order matches Phase 1 priority except where a dependency forces reordering (noted explicitly). Risk levels: **Low** (isolated, easily reviewed, low regression surface), **Medium** (touches shared logic or has a non-trivial regression surface), **High** (touches money-movement logic or a public contract with an external dependency).

| # | Title | Scope | Files | Est. LOC | Risk | Expected CI Impact | Reviewer Checklist | Merge Order |
|---|---|---|---|---|---|---|---|---|
| PR-1 | `fix(security): allowlist fields on admin user update` | SEC-1 | `routes/v1/admin/usersRoutes.js` | ~15 | **Low** | New test added, all existing admin tests must stay green | Confirm frontend admin console doesn't rely on this route for role/subscription/password edits; confirm disallow-list is complete (password, role, tokenVersion, subscription, _id, googleId) | 1 |
| PR-2 | `fix(security): filter unpublished courses out of search` | DB-2 | `controllers/searchController.js` | ~4 | **Low** | `search-optimization.test.js` extended, must stay green | Confirm both `globalSearch` and `searchCourses` are fixed, not just one | 2 |
| PR-3 | `chore(deps): bump nodemailer to 9.0.3` | SEC-DEP | `package.json`, `package-lock.json` | ~2 | **Low** | Full suite re-run; `npm audit` must show zero vulnerabilities | Confirm no code uses the `raw` send option (already verified in this plan, re-confirm at merge time in case new code landed since) | 3 |
| PR-4 | `fix(reliability): terminate process on uncaught exception/rejection` | REL-3 | `server.js` | ~20 | **Low** | New child-process integration test added | Confirm the handler funnels through the existing `shutdown()` drain path, not an abrupt exit | 4 |
| PR-5 | `fix(reliability): version-control the renewal-reminder cron schedule` | REL-1 | new `.github/workflows/cron-renewal-reminders.yml` | ~25 | **Low** | New workflow only; no application-code CI impact | Confirm `CRON_SECRET` is a masked GitHub Actions secret; confirm `workflow_dispatch` is present for manual testing | 5 (must land **after** PR-8 — see dependency note) |
| PR-6 | `fix(security): escape user input in HTML emails` | SEC-6 | `config/emailTemplates.js` | ~30 | **Low-Medium** | New unit tests for `row()`/five templates | Confirm no double-escaping introduced on the already-correct templates | 6 |
| PR-7 | `fix(observability): point external uptime monitor at /ready` | REL-4 (Alternative A) | none (external config) | 0 | **Low** | No CI impact — this is not a code change | Confirm alert actually fires in a staging drill before closing this out | 7 |
| PR-8 | `fix(reliability): atomic dedup claims for renewal + weekly cron jobs` | DB-8 | `controllers/cronController.js` | ~40 | **Medium** | New concurrency test (two overlapping invocations) | Confirm this merges **before** PR-5 activates real automated scheduling, so the very first automated run is already race-safe | 8 → **must precede PR-5's activation**, see note below |
| PR-9 | `feat(coupons): atomic redemption for Stripe checkout` | C-1 (Stripe leg only) | `controllers/couponController.js` (new `redeemCoupon`), `controllers/stripeController.js` | ~80 | **High** | New redemption-round-trip test; full Stripe test suite re-run | Line-by-line review of the transaction boundary; confirm rollback-safety if `redeemCoupon` throws mid-transaction | 9 |
| PR-10 | `feat(coupons): atomic redemption for PayPal checkout` | C-1 (PayPal leg) | `controllers/paymentController.js` | ~60 | **High** | New redemption-round-trip test; full PayPal test suite re-run | Same as PR-9, applied to the PayPal transaction shape (read-check-save, not findOneAndUpdate — confirm the shared `redeemCoupon` helper's atomicity still holds inside this different transaction pattern) | 10 |
| PR-11 | `feat(coupons): atomic redemption for manual payment review` | C-1 (manual leg) | `controllers/manualPaymentController.js` | ~50 | **High** | New redemption-round-trip test; full manual-payment suite re-run | Same as PR-9/10; confirm `reviewManualPayment`'s existing atomic status-claim pattern composes correctly with the new redemption claim | 11 |
| PR-12 | `fix(performance): add text indexes and switch search to $text` | DB-1 | `models/Course.js`, `models/Blog.js`, `models/User.js`, `controllers/searchController.js` | ~60 | **Medium** | `search-optimization.test.js` extended significantly; index-build step in migration notes | Product sign-off on relevance-ranking behavior change; confirm Arabic-script query handling; confirm index build strategy for existing Atlas tier | 12 |
| PR-13 | `feat(security): step-up re-auth for legacy admin role/subscription routes` | SEC-2 (Stage 1) | `routes/authRoutes.js`, `controllers/userAdminController.js` | ~50 | **Medium** | New negative-auth test | Confirm existing legitimate admin flows still succeed with the added step-up prompt | 13 |
| PR-14 | `refactor(security): migrate role/subscription + manual-payment-review routes to /api/v1/admin` | SEC-2 (Stage 2) + SEC-3 | `routes/authRoutes.js` (removal), `routes/v1/admin/usersRoutes.js` (addition), `routes/paymentRoutes.js` (removal), `routes/v1/admin/` (addition), `middleware/maintenanceGuard.js` (wire up `financialGuard`) | ~120 | **High** | Requires frontend coordination — flagged as a **coordinated release**, not a routine merge | Explicit frontend-team sign-off that the admin console has cut over to the new endpoints before this PR removes the old ones; confirm `financialGuard` now correctly resolves `req.adminUser` on the migrated route | 14 (own release window, not bundled with anything else) |
| PR-15 | `fix(validation): route-level validation middleware` | ARCH-3 | `utils/validationHelper.js` + all route files with validator arrays | ~150 (spread across many files) | **Medium** | Every mutating-route test suite re-run | Migrate one route file at a time within this PR series if the diff is too large for single-PR review; confirm no route silently starts rejecting previously-accepted (if invalid) payloads in a way that breaks an existing frontend flow | 15 |
| PR-16 | `fix(performance): paginate getConversation` | DB-9 | `controllers/messageController.js` | ~25 | **Low-Medium** | New pagination test | Confirm frontend messaging UI handles the new cursor-based response shape (may need frontend coordination if the UI doesn't already do incremental loading) | 16 |
| PR-17 | `refactor(api): normalize pagination envelope for coupons + contacts` | ARCH-6 | `controllers/couponController.js`, `controllers/contactController.js` | ~15 | **Medium** | New contract tests | **Requires frontend coordination** — response key changes from `coupons`/`contacts` to `data` | 17 |
| PR-18 | `fix(performance): decouple blog view-counting from the cacheable read` | DB-5 | `controllers/blogController.js` | ~15 | **Low** | New cache-header assertion test | Confirm view counts are still eventually consistent, just not synchronous with the read | 18 |
| PR-19 | `refactor(messaging): batch getContacts + getChildren into aggregations` | DB-3 + DB-4 (bundled — identical fix pattern, same root cause) | `controllers/messageController.js`, `controllers/parentController.js` | ~50 | **Low-Medium** | Query-count regression test | Confirm output shape is unchanged, only the query strategy | 19 |
| PR-20 | `refactor(api): introduce /api/v1 for public routes` | ARCH-3v | `app.js` | ~30 | **Medium** | Contract test for both versioned and unversioned paths | Confirm unversioned aliases remain live during transition; coordinate a deprecation timeline with frontend | 20 |
| PR-21 | `refactor(errors): standardize on return-based error responses` | ARCH-5 | many controllers | ~200 (mechanical, spread across files) | **Low** (per-file), aggregate Medium | Full suite re-run, zero test-file changes expected | Split into multiple small PRs per controller group if reviewers prefer smaller diffs — this table treats it as one logical unit, but nothing prevents further splitting at implementation time | 21 |
| PR-22 | `fix(observability): log rate-limit rejections distinctly` | REL-5 | `config/rateLimit.js`, `config/adminRateLimits.js` | ~15 | **Low** | New log-assertion test | Confirm log fields are useful for downstream alerting (ip, path, prefix) | 22 |
| PR-23 | `fix(coupons): graceful duplicate-key handling + referral-code backfill` | DB-7 | `controllers/referralController.js`, backfill script run | ~20 | **Low** | New concurrency test | Confirm the backfill script (`backfill:referral-codes` — already exists per `package.json`) is actually re-run against production after this ships | 23 |
| PR-24 | `chore: batch Low-tier fixes` (SEC-4, DB-L4, REL-L2, ARCH-L1 rename if approved) | Batch L (code-touching items only) | `config/validateEnv.js`, `controllers/searchController.js`, `.github/workflows/ci.yml` | ~40 | **Low** | Minor CI config change | Confirm CI still passes with the Node-version matrix addition | 24 |
| PR-25+ | `test: add coverage for review/message/notification/wishlist/parent controllers` (one PR per controller, 5 total) | REL-2 | new files under `tests/` | ~100 each | **Low** | Adds tests only; may surface pre-existing bugs as new findings | Standard test-quality review; treat any newly-discovered bug as its own follow-up finding, not silently patched inside the test PR | Parallel/ongoing, not gating |

**Dependency note on PR-5/PR-8 ordering:** REL-1 (giving the cron endpoint an actual, automated caller for the first time) must not go live before DB-8 (making the cron handlers safe under overlapping/concurrent invocation) is merged — otherwise the very first time real automation exists, it's exposed to the race the fix was meant to prevent. PR-8 is therefore sequenced to land before PR-5's scheduled trigger is enabled (PR-5 can be *merged* with only `workflow_dispatch` active, and the `schedule:` trigger added/enabled in a small follow-up once PR-8 is confirmed stable).

---

## Phase 4 — Dependency Review

All version data below was pulled directly from the repository (`backend/package.json`) and live registry queries (`npm outdated`, `npm audit`) run against the actual installed lockfile in this planning session — not from memory or general knowledge.

### Production dependencies

| Package | Installed | Latest (same major) | Latest (any major) | Advisories | Upgrade safe? | Breaking? | Priority |
|---|---|---|---|---|---|---|---|
| **nodemailer** | 9.0.0 | 9.0.3 | 9.0.3 | **1 High (GHSA-p6gq-j5cr-w38f)** — confirmed via `npm audit` | Yes — patch-only | No | **P0 — do now (PR-3)** |
| **express** | 4.22.2 | 4.22.2 (current) | 5.2.1 | None found | Staying on 4.x: yes, safe. Jumping to 5.x: needs a dedicated migration (Express 5 changes error-handling for async middleware, removes several deprecated APIs) | 5.x is a breaking major | P3 — no advisory pressure; evaluate Express 5 migration as a separate, dedicated initiative, not part of this patch plan |
| **mongoose** | 8.24.0 (wanted 8.24.1) | 8.24.1 | 9.7.4 | None found | Patch bump (8.24.0→8.24.1) safe immediately. Major (9.x) needs a dedicated migration (Mongoose 9 drops support for older MongoDB server versions and changes some query-builder defaults) | 9.x is a breaking major | P1 for the 8.24.1 patch bump (bundle into PR-24's batch); P3 for the 9.x major evaluation |
| **mongodb** (transitive, via mongoose) | 6.20.0 | — | — | None found | Managed by mongoose's own dependency range; no direct action needed | N/A | Tracks mongoose |
| **jsonwebtoken** | 9.0.2 (pinned range `^9.0.2`) | already latest in range | — | None found (not listed in `npm outdated`, meaning it's already current) | N/A | N/A | No action needed |
| **helmet** | 8.2.0 | already latest in range | — | None found | N/A | N/A | No action needed |
| **bcryptjs** | 2.4.3 | — | 3.0.3 | None found | 3.x is available but this codebase uses the *pure-JS* `bcryptjs` package (not native `bcrypt`) — worth separately evaluating whether native `bcrypt` (compiled bindings, faster) is preferable to a `bcryptjs` major bump, since both are viable paths and neither is advisory-driven | Needs its own compatibility check (API is largely compatible, but confirm hash-format compatibility with existing stored hashes before any bump) | P3 — no advisory pressure, evaluate carefully given it touches every stored password hash's verification path |
| **stripe** | 22.2.1 (wanted 22.3.0) | 22.3.0 | 22.3.0 | None found | Yes — patch bump | No | P1 — low-risk patch, bundle into PR-24's batch or its own tiny `chore(deps)` PR |
| **PayPal SDK** | **Not a dependency** — confirmed by direct grep of `package.json`; PayPal integration uses Node's built-in `fetch` (Node 18+) for direct REST calls, no SDK package | N/A | N/A | N/A | N/A | N/A | N/A — nothing to review; note this explicitly since the mission brief asked for it specifically |
| **cookie-parser** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **cors** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **dotenv** | 16.6.1 | — | 17.4.2 | None found | 17.x available, no advisory pressure | Minor breaking possible (dotenv majors occasionally change default-loading behavior) | P3 — no urgency |
| **express-rate-limit** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **express-validator** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **qrcode** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **speakeasy** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **winston** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **winston-daily-rotate-file** | latest in range | — | — | None found | N/A | N/A | No action needed |
| **ioredis** (optional) | latest in range | — | — | None found | N/A | N/A | No action needed |
| **rate-limit-redis** (optional) | 4.3.1 | — | 5.0.0 | None found | 5.x available, no advisory pressure | Check compatibility with the pinned `ioredis` major before bumping | P3 |

### Development dependencies (testing/tooling)

| Package | Installed | Latest | Advisories | Notes |
|---|---|---|---|---|
| `mongodb-memory-server` | latest in range | — | None | Bundles its own `mongodb@7.4.0` internally for the in-memory replica set — this is independent of the production `mongodb@6.20.0` driver version and does not need to match it |
| `supertest` | latest in range | — | None | No action needed |
| `nodemon` | latest in range | — | None | Dev-only, no production exposure |
| `eslint` | 9.39.4 | 10.6.0 | None | Major version available; evaluate flat-config migration separately, no urgency |
| `@eslint/js` | 9.39.4 | 10.0.1 | None | Tracks `eslint` major |
| `globals` | 15.15.0 | 17.7.0 | None | Tracks `eslint` major |

### Full-tree audit result

`npm audit` (including devDependencies, 367 total packages across prod/dev/optional) returns **exactly one** vulnerability: the nodemailer High-severity CVE addressed in PR-3. No moderate, low, or additional high/critical advisories were found anywhere in the dependency tree at the time of this review.

### Testing-library note

This project deliberately uses Node's built-in `node:test` runner rather than Jest/Mocha (a documented, reasoned choice per the CI workflow's own comments, not an oversight) — there is no external test-framework dependency to review beyond `supertest` (HTTP assertion helper) and `mongodb-memory-server` (in-memory DB for integration tests), both current.

---

## Phase 5 — Production Readiness

| Fix | Hot-fixable? | Shippable independently? | Feature-flaggable? | Safely rollback-able? | Explanation |
|---|---|---|---|---|---|
| SEC-1 (mass-assignment) | Yes | Yes | Not needed — additive restriction, no flag required | Yes, trivially | A field-allowlist is a pure request-time filter; can ship the moment it's reviewed, with no dependency on anything else in this plan |
| DB-2 (unpublished leak) | Yes | Yes | Not needed | Yes, trivially | One-line filter addition, zero dependencies |
| C-1 (coupon redemption) | No — needs staged rollout | Yes, but only **per payment method** (three independent PRs) | **Yes, and should be** — gate each payment method's redemption logic behind a flag so it can be disabled instantly if a charge-amount bug is discovered in production without reverting a deploy | Yes, per payment-method PR independently | This is the one fix in the plan where a feature flag materially reduces risk: money-computation bugs are exactly the class of issue you want an instant kill-switch for, not just a revert-and-redeploy cycle |
| SEC-2 Stage 1 (step-up auth) | Yes | Yes | Yes — flag the step-up requirement so it can be disabled if it turns out to block a legitimate workflow unexpectedly | Yes | Additive check, safe to flag |
| SEC-2 Stage 2 (route migration) | No | No — explicitly requires frontend coordination | N/A — this is a contract change, not a togglable behavior | Yes, if old routes are kept live in parallel for one release cycle as planned | This is the one item in the entire plan that cannot be treated as an independent, anytime-shippable change |
| DB-1 (search indexing) | No | Yes, independently | Could flag the `$text` query path vs. legacy regex fallback during rollout, for safety | Yes — index removal is a separate, deliberate later step, not part of the immediate rollback | Index builds should happen during a planned window, not treated as a hotfix; a flag between old/new query logic adds useful safety during rollout |
| REL-1 (cron scheduler) | Yes | Yes, but **only after DB-8** | Not needed | Yes, trivially (delete the workflow file) | Pure infrastructure addition; the only constraint is sequencing, not riskiness |
| SEC-DEP (nodemailer) | Yes | Yes | Not needed | Yes, trivially | Dependency bump, no code change |
| SEC-6 (email escaping) | Yes | Yes | Not needed | Yes, trivially | Template-rendering-only change |
| REL-3 (crash-exit handler) | Yes | Yes | Not needed | Yes, trivially | Additive process-level handler |
| REL-4 (monitoring on /ready) | Yes | Yes | N/A (external config) | Yes, trivially | Not a code change at all |
| ARCH-3 (validation middleware) | No — should be rolled out route-by-route | Yes, per route | Could flag per-route during migration if any route's behavior change is uncertain | Yes, per route | Recommend a phased rollout (a few routes at a time) rather than a single big-bang PR, despite being listed as one PR-15 in Phase 3 for planning clarity — implementation should split this further |
| DB-9 (message pagination) | Yes | Yes, but frontend should confirm readiness | Could flag old/new response shape during a transition window | Yes | Response-shape change benefits from a brief dual-support window |
| ARCH-6 (pagination envelope) | No — requires frontend coordination | No, must ship with frontend | N/A | Yes, jointly with frontend's revert | Same reasoning as SEC-2 Stage 2 — a contract change |

---

## Phase 6 — Enterprise Review

Five perspectives were applied against this plan. Where they disagree, the disagreement and its resolution are stated explicitly rather than silently picking one view.

**Staff Engineer:** The PR breakdown is appropriately granular, and the alternative-design comparisons in Phase 2 correctly favor low-blast-radius fixes over systemic rewrites for the urgent items — that's the right call for a plan meant to ship incrementally under review. One concern: PR-15 (ARCH-3's validation middleware) as scoped could still be a large, hard-to-review diff even if "one logical unit" — recommend it actually be split into one PR per route-file group (auth, payments, courses, admin) rather than landing as a single 150-LOC-spread change, even though Phase 3 treats it as one row for planning clarity.
*Resolution: accepted — Phase 5 already flagged this same concern for ARCH-3 independently; both perspectives agree, noted as an explicit implementation-time split.*

**Principal Engineer:** The coupon fix (C-1, PRs 9-11) is correctly identified as the highest-regression-risk item in the plan and correctly sequenced after all the low-risk items have already landed and stabilized — this is the right instinct (build confidence in the review/deploy cadence on safe changes before attempting the riskiest one). Question raised: should the three payment-method PRs (9/10/11) really be sequenced one-after-another in the same release, or should there be a longer observation window between them in production? *Concern: shipping all three in rapid succession doesn't give enough time to observe PR-9 (Stripe) in real production traffic before PR-10 (PayPal) introduces a similar-but-not-identical change to a different payment method.*
*Resolution: adopted — Phase 7's final recommendation adds an explicit minimum observation window (see below) between each of the three coupon PRs, rather than merging them back-to-back.*

**Security Lead:** SEC-2's two-stage approach is the correct call, but Stage 1 (step-up re-auth) must not be treated as "good enough, no rush on Stage 2" — flagged risk that once Stage 1 ships and the immediate pressure is relieved, Stage 2 (the actual architectural fix) could slip indefinitely, as has evidently already happened once (the code's own TODO predates this audit). *Recommendation: attach a hard deadline or a tracked follow-up ticket to Stage 2 at the moment Stage 1 ships, not "someday."*
*Resolution: adopted — Phase 7 explicitly names Stage 2 as a tracked, dated commitment, not an open-ended aspiration, and recommends it not be considered "done" until the legacy routes are actually removed (not just superseded).*

**SRE:** DB-1's index build and REL-1/DB-8's cron-scheduler-plus-idempotency sequencing are both correctly identified as needing operational care beyond code review (index build timing/monitoring; cron overlap testing). *Additional concern raised: the plan does not explicitly say who/what monitors the DB-1 index build in production, or what the go/no-go criteria are for confirming it landed safely.* Also flags that REL-4's Alternative A (external monitor on `/ready`) is presented as a zero-code, zero-risk change — true for the backend, but it does depend on someone actually configuring and testing the external monitor, which is an operational task easy to let slip exactly like the original cron-scheduler gap did.
*Resolution: adopted — Phase 7 adds explicit operational checkpoints (index-build monitoring criteria, and a required "alert-fired-in-a-drill" confirmation for REL-4) rather than treating either as complete once the config is merely entered.*

**Tech Lead:** The plan correctly identifies the two items requiring frontend coordination (SEC-2 Stage 2, ARCH-6) as special cases with their own release windows, and DB-9/ARCH-3v as "soft" coordination items (backward-compatible transition periods). *Concern: with roughly 25 PRs total plus 5 ongoing test-coverage PRs, the plan should be explicit that this is a multi-week effort, not a single sprint, and that the one-PR-at-a-time-with-approval execution model (per the explicit instruction governing how this plan will be executed) means the *calendar* timeline is longer than the *engineering-hours* timeline — that should be communicated to stakeholders up front so "why isn't this done yet" doesn't become a recurring question mid-execution.*
*Resolution: adopted — stated explicitly in Phase 7's closing note.*

**No unresolved disagreements remain** — every role's concern was either already reflected elsewhere in the plan (and cross-referenced) or explicitly incorporated into Phase 7 below.

---

## Phase 7 — Final Recommendation

1. **Exact implementation order:** as listed in Phase 3's PR table (PR-1 through PR-24, plus the 5 REL-2 test-coverage PRs running in parallel/ongoing throughout, not gating anything else), with the two sequencing constraints called out explicitly: **DB-8 must land before REL-1's `schedule:` trigger is activated** (PR-5 can merge with only `workflow_dispatch`; enable `schedule:` only after PR-8 is confirmed stable), and **SEC-2 Stage 2 (PR-14) ships as its own isolated, dated release**, not bundled with anything adjacent in the sequence.

2. **Exact merge order:** identical to the implementation order above, with one addition from the Phase 6 review: **insert a minimum observation window of at least one full business day of production traffic between PR-9, PR-10, and PR-11** (the three coupon-redemption PRs) rather than merging them back-to-back, per the Principal Engineer's review concern — confirm no charge-amount anomaly is observed on the Stripe path before proceeding to PayPal, and no anomaly on PayPal before proceeding to manual-payment review.

3. **Exact deployment order:** matches merge order. No PR in this plan requires a deployment sequence different from its merge sequence — none of these fixes depend on a separate, later "activation" step except REL-1's `schedule:` trigger (see above) and SEC-2 Stage 2's frontend-cutover confirmation (see #8 below).

4. **Database migration required?** **No schema migration** is required for any Critical/High/Medium fix. C-1 (coupon redemption) is the only fix that touches data shape, and it only *adds* usage to fields (`Coupon.usedCount`/`usedBy`) that already exist in the schema today — no new fields, no backfill, no migration script. (The optional `Payment`/`Invoice` `couponCode`/`discountApplied` field mentioned in C-1's design is additive and nullable, and does not require backfilling historical records — it simply starts being populated going forward.)

5. **Downtime required?** **No planned downtime** for any fix in this plan. `server.js`'s existing graceful-shutdown logic (already confirmed correct in the verification pass) means every one of these changes can go out via Render's normal rolling/restart-based deploy with zero dropped in-flight requests. The one item warranting operational care (not downtime) is DB-1's text-index build, which should be scheduled during a lower-traffic window and monitored, per the SRE review, but does not require taking the service offline (Atlas builds indexes online on a replica set).

6. **Cache invalidation required?** **No.** This backend has no data-caching layer today (confirmed in the original audit) — the only cache-adjacent item is DB-5 (blog view-counter/`Cache-Control` header), which is additive (a header that doesn't exist today starting to exist) rather than an invalidation of anything currently cached.

7. **API versioning required?** **Not required for any Critical/High/Medium fix to ship.** ARCH-3v (introducing `/api/v1/*` for the public API) is explicitly a lower-priority, independent improvement (composite score 8, near the bottom of the Medium tier) — it is not a prerequisite for anything else in this plan and should not be allowed to block or delay the higher-priority items above it.

8. **Frontend coordination required?** **Yes, for exactly three items**, each already flagged in-line above: **SEC-2 Stage 2** (route migration — the admin console must switch endpoints before the legacy routes are removed), **ARCH-6** (pagination envelope key rename from `coupons`/`contacts` to `data`), and, more softly, **DB-9** (message pagination — recommend confirming the messaging UI's readiness for cursor-based responses, though a backward-compatible default can avoid hard-blocking this one). Every other item in this plan is backend-only and requires no frontend change.

9. **QA sign-off required?** **Yes, explicitly for:** C-1 (all three coupon PRs — a manual test-purchase with a real test-mode coupon on each payment method, beyond automated tests, before each production release), DB-1 (product sign-off specifically on search-relevance behavior change, since `$text` matching semantics differ from substring regex matching, and this is a user-facing behavior change a test suite alone can't fully validate), and SEC-2 Stage 2 (explicit frontend-team functional sign-off that admin role/subscription management still works end-to-end against the new endpoints before the old ones are removed). Recommended, not strictly required, for every other item: a lightweight smoke-test pass post-deploy given the change is user-facing (search leak fix, email rendering).

10. **Production monitoring to add after deployment?** **Yes:** REL-4 (external `/ready` monitor with real alerting) should be considered a prerequisite that ideally lands *before or alongside* the riskier fixes (C-1, DB-1) rather than only after — having real alerting in place before the highest-regression-risk changes ship gives the team a faster signal if something goes wrong with them specifically, not just for its own sake. Additionally, per the SRE review: add explicit, short-lived post-deploy watch items for **DB-1** (query-latency and error-rate on search endpoints for the first 48 hours after the index/query-rewrite ships) and **C-1** (a daily reconciliation check — total coupon-discount-amount applied vs. `usedCount` increments — for at least the first two weeks after each payment method's redemption logic goes live, as a cheap correctness backstop beyond automated tests).

**Closing note on execution cadence (per explicit instruction governing how this plan is carried out):** this plan will be executed **one PR at a time**. Each PR ships, CI must pass, and explicit approval is required before work begins on the next PR in the sequence — no batch execution, regardless of how independent two adjacent PRs might appear. Given roughly 30 total PRs (24 fix/chore PRs plus 5 ongoing test-coverage PRs), per the Tech Lead review this is realistically a multi-week calendar effort even though the underlying engineering-hours are modest for most individual items — this should be communicated as the expected cadence up front, not discovered as a surprise partway through.
