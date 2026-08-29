import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";
import { plans } from "./plans";
import { subscriptions } from "./subscriptions";
import {
  currencyCodeEnum,
  paymentGatewayEnum,
  paymentKindEnum,
  paymentStatusEnum,
  providerEventStatusEnum,
} from "./enums";

/**
 * Append-oriented financial ledger (docs/product-scope-audit.md §7) — one
 * row per transaction ATTEMPT, not a mutable "current state of this
 * payment" record. `user_id` is NOT NULL: paid checkout requires login.
 *
 * `kind` distinguishes a charge from a refund; a refund is always its own
 * new row (`parent_payment_id` → the charge it refunds), never an UPDATE
 * that flips the original charge's status — this is what makes
 * multiple/partial refunds against one charge representable at all.
 *
 * Status transitions are deliberately limited to `pending→succeeded` and
 * `pending→failed`; once a row is `succeeded`/`failed` it is frozen. This
 * can't be expressed as a plain CHECK (it needs to see the OLD row), so
 * it's enforced by a `BEFORE UPDATE` trigger hand-authored in the
 * migration SQL (`enforce_payment_status_transition()`), not here. A
 * `BEFORE DELETE` trigger (`forbid_payment_delete()`) blocks deletion
 * outright — this is a real constraint now, ahead of the RLS/grants
 * layer that will reinforce it later. A third trigger
 * (`validate_refund_insert()`, baseline remediation — was
 * `forbid_refund_of_refund()`, which only checked the parent's `kind`)
 * locks the parent row (`SELECT ... FOR UPDATE`, serializing concurrent
 * refunds against the same charge) and rejects a refund insert unless:
 * the parent is a `charge` with `status = 'succeeded'`; the new row's
 * `user_id`/`currency_snapshot`/`gateway` match the parent's; and
 * `sum(existing succeeded-or-pending refunds) + this amount_minor <=
 * parent.amount_minor`. None of that is expressible as a plain CHECK
 * (it needs to read other rows and lock against races) — see
 * 0001_functions_triggers.sql. The CHECK below only guarantees a refund
 * always names *some* parent; the trigger is what makes the parent
 * actually valid.
 *
 * Money is always `amount_minor` — an integer in minor currency units.
 * Three related amounts are distinguished by name on every row:
 * `amount_minor` (actual charged), `plan_amount_minor_snapshot`
 * (pre-discount price), `discount_minor_snapshot` (actual discount
 * applied) — captured once, at write time, from `plans`, so a later plan
 * price edit never reinterprets this row. For a `charge` row with a
 * known plan snapshot, `amount_minor` must reconcile to
 * `plan_amount_minor_snapshot - discount_minor_snapshot` (CHECK below) —
 * refund rows and legacy/planless charges are exempt.
 *
 * No full raw gateway webhook payload is stored here — `gateway_metadata`
 * is an explicitly allowlisted jsonb (payment-method brand, masked
 * last4, receipt URL only; never full card data or a full billing
 * address unless a real feature needs it — nothing sensitive is ever
 * written here, so no purge/retention job is needed for this column).
 * The full (redacted) webhook payload lives only in `provider_events`.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    kind: paymentKindEnum("kind").notNull().default("charge"),
    parentPaymentId: uuid("parent_payment_id").references(
      (): AnyPgColumn => payments.id,
      { onDelete: "restrict" },
    ),
    amountMinor: integer("amount_minor").notNull(),
    planAmountMinorSnapshot: integer("plan_amount_minor_snapshot"),
    discountMinorSnapshot: integer("discount_minor_snapshot").notNull().default(0),
    currencySnapshot: currencyCodeEnum("currency_snapshot").notNull().default("EUR"),
    providerPriceIdSnapshot: text("provider_price_id_snapshot"),
    gateway: paymentGatewayEnum("gateway").notNull(),
    gatewayPaymentId: text("gateway_payment_id"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    gatewayMetadata: jsonb("gateway_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "payments_kind_parent_consistency",
      sql`(${t.kind} = 'charge' AND ${t.parentPaymentId} IS NULL) OR (${t.kind} = 'refund' AND ${t.parentPaymentId} IS NOT NULL)`,
    ),
    check("payments_amount_minor_nonneg", sql`${t.amountMinor} >= 0`),
    check(
      "payments_amount_reconciles_to_plan_snapshot",
      sql`(${t.kind} = 'refund') OR (${t.planAmountMinorSnapshot} IS NULL) OR (${t.amountMinor} = ${t.planAmountMinorSnapshot} - ${t.discountMinorSnapshot})`,
    ),
    uniqueIndex("payments_gateway_payment_id_unique")
      .on(t.gateway, t.gatewayPaymentId)
      .where(sql`${t.gatewayPaymentId} IS NOT NULL`),
    // Every ownership-scoped RLS policy on this table filters by
    // user_id — without a plain index that's a seq scan.
    index("payments_user_id_idx").on(t.userId),
  ],
);

/**
 * The real Stripe/PayPal webhook idempotency ledger — decoupled from
 * `payments` (docs/product-scope-audit.md §8). Every inbound event is
 * recorded here BEFORE being acted on. `unique(provider,
 * provider_event_id)` is the hard guarantee: a duplicate delivery is
 * rejected at the database level before any business logic runs. That
 * unique-violation is an expected, caught outcome (idempotent success),
 * never a 500, in whatever code processes these events.
 *
 * `claim_provider_event(uuid)` (hand-authored SQL function in the
 * migration) does the atomic `pending → processing` claim BEFORE any
 * side-effect work runs, so only one worker ever processes a given
 * event; `complete_provider_event(id, claim_token, result, error_code)`
 * then does `processing → processed/failed` once the work is actually
 * done — the `claim_token` parameter (RLS Remediation Round 3, see
 * `claim_token` below) is what makes this a FENCED completion, not just
 * an id+status check: it must match the row's current token, so a
 * worker whose lease already expired and was reclaimed by someone else
 * can never complete a claim it no longer holds.
 * (Baseline remediation: the first version of this function claimed
 * *after* the side effect instead of before, which didn't actually
 * prevent two workers from both performing it — see
 * 0001_functions_triggers.sql.)
 *
 * Full raw webhook payloads are never stored — only a `payload_hash`
 * (integrity/dedup check) and a small, redacted `payload_summary`.
 */
export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: paymentGatewayEnum("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadSummary: jsonb("payload_summary"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingStatus: providerEventStatusEnum("processing_status")
      .notNull()
      .default("pending"),
    // RLS Remediation Round 2 (finding 7): claim_provider_event() used to
    // set processing_status = 'processing' with no lease/timeout at all —
    // a worker that claimed an event and then crashed left it stuck in
    // 'processing' forever, no recovery path. Set by claim_provider_event()
    // on claim (lib/db/drizzle/0003_provider_events_lease.sql);
    // reclaim_stale_provider_events() resets any row whose claimed_at is
    // older than its staleness threshold back to 'pending' (clearing this),
    // the real recovery contract for a dead worker.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // RLS Remediation Round 3 (Section B): the lease above had no fencing —
    // a worker whose lease already expired and was reclaimed could still
    // call complete_provider_event() successfully later, since that
    // function only ever checked id + status, not who currently holds the
    // lease. claim_token is the fencing identity: a fresh random UUID
    // minted on every successful claim (including a reclaim-then-reclaim
    // by a new worker); complete_provider_event() now requires the
    // caller's token to match the row's CURRENT token, so a stale worker's
    // completion call matches zero rows instead of closing out a claim it
    // no longer holds. lease_expires_at replaces the old "claimed_at +
    // fixed interval, decided at reclaim time" implicit lease with an
    // explicit expiry set at claim time (lib/db/drizzle/
    // 0005_provider_events_fencing.sql). attempt_count is incremented on
    // every claim (including reclaims) — a visible retry counter; this
    // schema deliberately does not yet enforce a max-attempts cutoff (no
    // product policy exists for one), see that migration's doc comment.
    claimToken: uuid("claim_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCode: text("error_code"),
  },
  (t) => [
    uniqueIndex("provider_events_provider_event_unique").on(t.provider, t.providerEventId),
    // reclaim_stale_provider_events() scans exactly this shape (processing
    // rows, ordered/filtered by lease expiry) — a partial index keeps that
    // a cheap index scan instead of a seq scan as the table grows.
    index("provider_events_processing_lease_idx")
      .on(t.leaseExpiresAt)
      .where(sql`${t.processingStatus} = 'processing'`),
  ],
);
