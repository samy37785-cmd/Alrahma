# Stage 2J-B — Lossless Mongo → Supabase Mapping Contract

Executive, per-field mapping for every real MongoDB collection in the
`al-rahma` database, against the canonical Postgres schema (migrations
0000–0022). No values or PII appear below — field NAMES and their
classification only. Real counts are from the Stage 2J-A inventory and
the Stage 2J-B local restore (both against `Cluster0.al-rahma`, never
`sample_mflix` or any other database/project).

Classification legend (exactly the six the task specifies):

- **PRESERVED_EXACTLY** — same value, same shape, new column name only.
- **TRANSFORMED_LOSSLESSLY** — deterministic, reversible-in-principle
  transform (type cast, enum rename, flatten) that loses no information.
- **DERIVED_WITH_PROOF** — the target value is computed from the source,
  and the computation is provably correct/unique, not a guess. The proof
  is stated inline.
- **NOT_APPLICABLE** — the field exists in the model but has no real
  value in the actual data being migrated (verified, not assumed).
- **BLOCKED** — a real field with no destination, and a documented,
  evidence-based reason it cannot get one right now.
- **REQUIRES_NEW_SCHEMA** — closed by migration `0022_lossless_migration_support.sql`.

---

## 1. `users` (7 documents) → `auth.users` + `profiles`

| Mongo field | Classification | Notes |
|---|---|---|
| `name` | PRESERVED_EXACTLY | → `profiles.name` |
| `email` | PRESERVED_EXACTLY | → `auth.users.email` / `profiles.email`, lowercased (already lowercase in the model) |
| `password` (bcrypt hash) | **BLOCKED — by design** | Never migrated. A GoTrue account is created with a fresh CSPRNG throwaway password; every migrated user requires a real password-reset flow. This is a hard security rule, not a gap. |
| `role` (`student`\|`teacher`\|`parent`\|`admin`) | TRANSFORMED_LOSSLESSLY | See §6 below — fully bijective via `profiles.role` + `profiles.is_teacher` + `admin_role_assignments`, all three of which **already exist** (0013/0018), previously just unused by the migration tool (Stage 2J-A Defect #1). |
| `teacher` (assigned teacher ref) | TRANSFORMED_LOSSLESSLY (0/7 real data) / would be REQUIRES resolution | → `profiles.teacher_id` (already exists, 0014). Resolved via `migration_source_ledger` after both accounts exist. **Real data check**: all 7 sampled documents show `teacher` either absent or `null` — zero real assignments exist to migrate. |
| `children` (parent → student refs) | TRANSFORMED_LOSSLESSLY | → `parent_student_links` rows (already exists, 0016) — one row per (parent, child) pair, resolved the same way as `teacher`. |
| `parentLinkCode` | PRESERVED_EXACTLY | → `profiles.parent_link_code` (already exists, 0014) |
| `familyName` | PRESERVED_EXACTLY | → `profiles.family_name` (already exists, 0014) |
| `specialization`/`bio`/`gender`/`languages`/`subjects` | PRESERVED_EXACTLY | All already exist on `profiles` (0014) |
| `rating` | NOT_APPLICABLE (real data) | 0/7 real users carry a value (no field present in the census for any sampled document). No `profiles` column exists for a denormalized rating (`reviews_public` is the new design's source of truth) — if a real value existed, this would be BLOCKED-by-design, but it does not. |
| `referralCode` | PRESERVED_EXACTLY | → `profiles.referral_code` (already exists, 0014) |
| `googleId` | **BLOCKED** | Linking a real OAuth identity into `auth.identities` requires either the actual OAuth token exchange or careful use of the GoTrue Admin API's identity-linking — not a safe bulk data-only backfill. A user who signed in with Google before must re-link Google after migration. |
| `xp`/`level`/`streak`/`lastStudyDate`/`badges` | PRESERVED_EXACTLY | All already exist on `profiles` (0014) — the profiles.ts source file's own doc comment claiming "no gamification" was stale; fixed in this stage. |
| `resetToken`/`resetTokenExpiry` | **BLOCKED — by design** | A Mongo password-reset token is meaningless in GoTrue's own auth system; never migrated. |
| `tokenVersion` | **BLOCKED — by design** | Mongo's own JWT-invalidation counter; GoTrue manages its own session/refresh-token lifecycle independently. |
| `createdAt`/`updatedAt` | PRESERVED_EXACTLY | → `profiles.created_at`/`updated_at` |
| `subscription` (embedded object) | see §8 | Own section below — 6/7 real users carry one. |

`RefreshToken` documents (0 real rows) — **NOT_APPLICABLE**: GoTrue owns its own refresh-token table; a Mongo `RefreshToken` document has no destination and none is needed.

## 2. `adminusers` (0 documents) → `auth.users` + `profiles` + `admin_role_assignments` + `role_permissions`/`user_extra_permissions`

Tool path already existed and is correct (`migrateOneAdmin`); 0 real
documents means this path is exercised only via the synthetic fixture
(§12). `_mfaSecret`/`_mfaPendingSecret` (TOTP) — **BLOCKED — by design**,
never migrated; every migrated admin starts with zero MFA factors and
re-enrolls. `failedLoginAttempts`/`lockedUntil`/`lastLoginAt`/`lastLoginIp`
— **NOT_APPLICABLE**: brute-force/session bookkeeping specific to the old
AdminUser login path, meaningless once GoTrue owns authentication.

## 3. `trialrequests` (10) → `trial_requests` — READY, unchanged

All fields preserved exactly (`name`/`email`/`phone`/`course`/`message`/`status`
allowlist matches exactly).

## 4. `subscribers` (1) → `subscribers` — READY, unchanged

`email` preserved exactly; `status` is a TRANSFORMED_LOSSLESSLY constant
(`'subscribed'`, matching the old model's implicit meaning — it had no
status field at all).

## 5. `courses` (6) → `courses` — READY, unchanged

All fields TRANSFORMED_LOSSLESSLY (price → `price_minor` integer cents,
`tags`/`resources`/`modules` → jsonb) — unchanged from Stage 2E/2F tooling.

## 6. Persona/role representation (bijective — corrected in this stage)

| Mongo `role` | Postgres representation |
|---|---|
| `student` | `profiles.role = 'user'`, `is_teacher = false` |
| `teacher` | `profiles.role = 'user'`, `is_teacher = true` |
| `parent` | `profiles.role = 'user'`, `is_teacher = false`, + one `parent_student_links` row per `children[]` entry |
| `admin` | `profiles.role = 'admin'` **+** `admin_role_assignments.role = 'admin'` (never `'super-admin'`) |

All four values round-trip losslessly. No `account_role` enum widening —
it stays exactly `user`/`admin` as the schema's own design requires.

## 7. The two real admins (confirmed via this stage's local rehearsal)

Both are `users` documents with `role: 'admin'` (not separate `adminusers`
documents — Mongo's ad-hoc "role field on User" convention, distinct from
the full `AdminUser` RBAC system). Fix: `migrateOneUser()` now detects
`role === 'admin'` and additionally writes `profiles.role = 'admin'` +
`admin_role_assignments (user_id, role='admin')` — never `'editor'`,
`'viewer'`, or `'super-admin'`. Both accounts require MFA re-enrollment
before `is_admin_aal2()` grants them anything (structurally unavoidable —
zero MFA factors exist post-migration by design).

## 8. `subscription` (embedded on `users`, 6/7 real documents) → `subscriptions` + `plans`

| Mongo field | Classification | Notes |
|---|---|---|
| `plan` (free-text plan name) | DERIVED_WITH_PROOF | Resolved against `plans.slug` via a deterministic slugify(name) + an explicit, hand-reviewed alias table sourced from the live site's real pricing copy (`artifacts/al-rahma-academy/.../Pricing.jsx`) — never an invented plan. An unresolvable plan name is a **FAIL**, not a default. |
| `status` (`active`\|`inactive`) + `validUntil` | DERIVED_WITH_PROOF | `active` + `validUntil` in the future → `subscriptions.status='active'`; `active` + `validUntil` in the past → `'expired'`; `inactive` → `'canceled'` if `validUntil` was ever set (a real subscription that ended), else `'expired'` (never activated — closest honest value; there is no `'never_active'` state in the target enum, and `'canceled'` would falsely imply one existed). Every branch is logged with its reason; nothing defaults silently. |
| `provider` (`stripe`\|`paypal`\|`manual`) | PRESERVED_EXACTLY | → `subscriptions.provider` (enum already matches exactly) |
| `stripeCustomerId`/`stripeSubscriptionId` | PRESERVED_EXACTLY | → `subscriptions.provider_customer_id`/`provider_subscription_id` |
| `activeSince` | PRESERVED_EXACTLY | → `subscriptions.current_period_start` |
| `validUntil` | PRESERVED_EXACTLY | → `subscriptions.current_period_end` |
| `cancelAtPeriodEnd` | PRESERVED_EXACTLY | → `subscriptions.cancel_at_period_end` |
| `renewalReminderSentFor` | PRESERVED_EXACTLY | → `subscriptions.renewal_reminder_sent_for` (added by 0020, backfilled into the `.ts` source this stage) |

`plans` themselves are seeded once, deterministically and idempotently,
via `create_plan_version()` (the schema's own sanctioned RPC — raw
INSERT into `plans` is not possible, RLS forbids it) from a fixed,
version-controlled list derived from the live site's real pricing, never
invented at migration time.

## 9. `payments` (15) → `payments` (+ `payment_source_snapshots`)

| Mongo field | Classification |
|---|---|
| `plan` | DERIVED_WITH_PROOF → `plan_id` (same resolution as §8; FAIL if unresolvable) |
| `amount`, `currency` | TRANSFORMED_LOSSLESSLY → `amount_minor` (integer cents; FAIL, not round, on any non-integer-cent value); currency must already be `EUR` (the only value `currency_code` supports) — any other value is a FAIL, never a silent conversion |
| `gateway` | PRESERVED_EXACTLY (`stripe`/`paypal` both already in `payment_gateway`) |
| `method` | NOT_APPLICABLE as a column | No dedicated column; `card`/`paypal` is fully implied by `gateway` for this dataset — kept in `payment_source_snapshots.raw_payload` for completeness, not dropped |
| `customer.{name,email,phone}` | PRESERVED_EXACTLY | → new `payments.customer_{name,email,phone}_snapshot` (0022) |
| `userId` (9/15 present, 6/15 null) | TRANSFORMED_LOSSLESSLY | Resolved via the migrated-users ledger when present; **left NULL, never a fake profiles row**, when absent (0022 made `payments.user_id` nullable) |
| `status` (`pending`\|`paid`\|`failed`) | TRANSFORMED_LOSSLESSLY | `pending→pending`, `paid→succeeded`, `failed→failed`; any other value = FAIL |
| `gatewayOrderId` | PRESERVED_EXACTLY | → new `payments.gateway_order_id` (0022) — never conflated with `gatewayTxnId` |
| `gatewayTxnId` | PRESERVED_EXACTLY | → existing `payments.gateway_payment_id` |
| `stripeCustomerId`/`stripeSubscriptionId` | NOT_APPLICABLE as payments columns | Not present on `payments` by design (they live on `subscriptions`) — preserved in `payment_source_snapshots.raw_payload`, and cross-checked against the resolved `subscription_id` when one exists |
| `raw` | PRESERVED_EXACTLY | → new `payment_source_snapshots.raw_payload` (0022), locked to `service_role` only, never exposed to the owning user, never printed/logged by the tool |
| `createdAt`/`updatedAt` | PRESERVED_EXACTLY | |

No refund/provider-event row is ever invented for a payment that doesn't
carry one in the source — a migrated `payments` row is a `kind='charge'`
row only; a real `provider_events`/refund migration is future, separate
work if Stripe/PayPal history is ever pulled in independently.

**Incidental finding, not just a migration accommodation**: dropping
`payments.user_id`'s `NOT NULL` turns out to fix a real, pre-existing
live-application bug, not only unblock the 6 unlinked-source charges.
`backend/data/supabase/stripeController.js` and `paypalController.js`
are both routed `@access Public (softProtect attaches req.user if
logged in)` and already compute `userId = req.user?._id ?? null` before
inserting — the live backend has always intended to support an
unauthenticated guest checkout. Before 0022, that code path's own
`INSERT INTO payments` would have thrown on the DB's `NOT NULL`
constraint the moment a real guest actually checked out — the schema was
silently more restrictive than the application code it was meant to
support. `lib/db/test/schema.local.test.mjs` previously asserted the
broken behavior ("payments insert without user_id is rejected — paid
checkout requires login") as correct; that assertion has been corrected
to match the code's actual, intended design, not the reverse.

## 10. `enrollments` (13) → `enrollments`

| Mongo field | Classification |
|---|---|
| `name`/`email`/`whatsapp`/`country`/`city`/`timezone` | PRESERVED_EXACTLY |
| `times`/`subjects` | PRESERVED_EXACTLY (jsonb array, already the target's own type) |
| `lang`/`level`/`ageGroup`/`genderPref` | PRESERVED_EXACTLY |
| `teacherId` (Number) | TRANSFORMED_LOSSLESSLY → `preferred_teacher_key` (text cast, static directory key, never a `profiles` FK — matches the target schema's own documented design) |
| `teacherName` | PRESERVED_EXACTLY → `preferred_teacher_name` |
| `plan` | PRESERVED_EXACTLY → `requested_plan_slug` (lead-capture snapshot only, never a live FK — matches target design) |
| `status` | TRANSFORMED_LOSSLESSLY | `pending→new` (documented rule — the target's `'new'` is the semantic equivalent of the old `'pending'`), `contacted→contacted`, `enrolled→enrolled`, `cancelled→cancelled` |
| `notes` | PRESERVED_EXACTLY | Empty string stays empty string — never collapsed to a different value |
| `createdAt`/`updatedAt` | PRESERVED_EXACTLY |

## 11. Quran domains (1 + 1 + 1 real documents)

`quran_bookmarks`: `user`/`verseKey`/`chapterId`/`verseNum`/`note` all
PRESERVED_EXACTLY (target already has a `color` column too, unused by the
one real document — not a loss, just unset).

`quran_reading_progress`: `lastPosition.*` → `resume` jsonb PRESERVED_EXACTLY
(identical field shape). `dailyGoal.target` → `goal` PRESERVED_EXACTLY;
`dailyGoal.type` → new `goal_type` (0022). `streak.current` → `streak`
PRESERVED_EXACTLY; `streak.longest` → new `longest_streak` (0022);
`streak.lastReadDate` → new `last_read_date` (0022). `history[]` →
`history` jsonb PRESERVED_EXACTLY (identical shape).

`quran_memorization_stats`: `dailyGoal.target` → `goal` PRESERVED_EXACTLY;
`dailyGoal.type` → new `goal_type` (0022). `stats.totalRecordings`/
`totalPracticeTime` → PRESERVED_EXACTLY. `stats.lastPracticeDate` → new
`last_practice_date` (0022). `streak.current` → `streak` PRESERVED_EXACTLY;
`streak.longest` → new `longest_streak` (0022). `streak.lastReadDate` on
*this* collection is verified against the local restore to be identical
to `stats.lastPracticeDate` on the same document (both are the
"today's activity date" field, duplicated by a copy-paste in the
original schema) — DERIVED_WITH_PROOF: not migrated as a second column,
the proof of equality is recorded in the migration report per document.

## 12. Zero-row domains — tooling proven via synthetic fixtures, not skipped

`coupons`+`coupon_redemptions`, `manual_payments`, `invoices`,
`notifications`, `system_audit_logs`→`admin_audit_log`, `counters`→`document_counters`:
0 real documents each, but each domain's export/transform/validate/upsert/
rollback path is exercised against a synthetic fixture document (§H of
the final report) — a real code path, not a documented "would work"
claim. Where the target vocabulary is narrower than Mongo's
(`notifications.type`: 5/14 values overlap — `payment_received`,
`payment_failed`, `subscription_renewed`, `subscription_expiring`,
`admin_announcement`; the other 9 LMS-era values have no destination),
the tool **fails closed** on the 9 unmapped values rather than silently
dropping or reinterpreting them.

## 13. `blogs` (0) — READY_WITH_LOSS closed to fail-closed, not schema growth

`category`/`readTime`/`coverImage`/`seo.canonicalUrl` have no column on
the current `blogs` table — `docs/option-a-mongo-supabase-parity-map.md`
§9 already documented this as a real gap. Whether the original schema
design deliberately dropped these fields or simply never carried them
forward is **not established by any document this stage found** — no
source states that intentionally, and this report does not claim it did.
What Stage 2J-B decides now, explicitly, for the migration tool itself:
rather than either (a) silently dropping these values, or (b) growing
the schema to store fields with zero real data behind them today, the
tool **fails closed** — any Mongo blog document carrying a non-empty
value in one of these four fields is rejected with a named reason, never
silently dropped. 0 real documents means this path is exercised only via
synthetic fixtures; if a real blog document with one of these fields set
is ever found, that is the trigger to make the real, deliberate
schema-vs-fail-closed decision this task defers, not to quietly drop it.

## 14. Legacy/orphaned collections — `posts`, `comments`, `tutorconversations` (0 each)

No live Mongoose model, no target table (feature retired per
`docs/product-scope-audit.md`) — **NOT_APPLICABLE**, and empty, so no
real data is at risk either way.
