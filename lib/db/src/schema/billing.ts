import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";
import { plans } from "./plans";
import { payments } from "./payments";
import {
  currencyCodeEnum,
  discountScopeEnum,
  invoiceStatusEnum,
  manualPaymentStatusEnum,
  couponTypeEnum,
} from "./enums";

/**
 * A single period's proof-of-payment for admin review (docs/product-
 * scope-audit.md §7). `user_id` NOT NULL — paid checkout requires login.
 * Review happens exclusively via `admin_review_manual_payment()` (atomic
 * `pending → approved`/`rejected` claim, `0002_rls.sql`). Activating the
 * corresponding `subscriptions` row on approval happens exclusively via
 * `admin_activate_manual_subscription()` (RLS Remediation Round 3,
 * `0006_subscription_integrity.sql`) — a second atomic claim on
 * `status = 'approved' AND activated_at IS NULL`, so a record can never
 * be activated twice.
 */
export const manualPayments = pgTable(
  "manual_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    requestedPlanSlug: text("requested_plan_slug"),
    amountMinor: integer("amount_minor").notNull(),
    currencySnapshot: currencyCodeEnum("currency_snapshot").notNull().default("EUR"),
    method: text("method").notNull(), // wu | moneygram | payoneer | bank | paypal_manual
    reference: text("reference"),
    notes: text("notes"),
    status: manualPaymentStatusEnum("status").notNull().default("pending"),
    adminNote: text("admin_note"),
    reviewerAdminId: uuid("reviewer_admin_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Baseline remediation: was missing — this row's status/adminNote/
    // reviewedAt all mutate on admin review, same as every other
    // mutable-status table here.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // RLS Remediation Round 3 (Section C): the missing piece this table's
    // own doc comment already flagged as deferred — set exactly once, by
    // admin_activate_manual_subscription() (lib/db/drizzle/
    // 0006_subscription_integrity.sql), which does an atomic `status =
    // 'approved' AND activated_at IS NULL` claim before inserting the
    // subscriptions row, making double-activation of the same approved
    // manual payment structurally impossible, not just discouraged.
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (t) => [
    check("manual_payments_amount_minor_nonneg", sql`${t.amountMinor} >= 0`),
    index("manual_payments_user_id_idx").on(t.userId),
  ],
);

/**
 * Receipts. Independent snapshots so an invoice's historical content
 * never shifts if `plans`/`profiles` change later — same discipline as
 * `payments`' snapshot fields.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    customerNameSnapshot: text("customer_name_snapshot"),
    planNameSnapshot: text("plan_name_snapshot"),
    amountMinorSnapshot: integer("amount_minor_snapshot").notNull(),
    discountMinorSnapshot: integer("discount_minor_snapshot").notNull().default(0),
    currencySnapshot: currencyCodeEnum("currency_snapshot").notNull().default("EUR"),
    // Baseline remediation: was free `text`, now a real enum. Vocabulary
    // is real evidence, not guessed — matches the old `Invoice.js`
    // Mongoose model exactly
    // (`.migration-backup/backend/models/Invoice.js:18`,
    // `enum: ['paid', 'pending', 'cancelled']`, default `'paid'`).
    status: invoiceStatusEnum("status").notNull().default("paid"),
    gatewayInvoiceId: text("gateway_invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Baseline remediation: was missing — `status` mutates (e.g.
    // pending -> paid/cancelled).
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_gateway_invoice_id_unique")
      .on(t.gatewayInvoiceId)
      .where(sql`${t.gatewayInvoiceId} IS NOT NULL`),
    index("invoices_user_id_idx").on(t.userId),
  ],
);

/**
 * Discount codes. `discount_scope` forces every coupon to state its own
 * duration explicitly — nothing assumes a discount silently applies
 * forever on a recurring subscription. `discount_duration_cycles` is
 * required for, and only for, `fixed_duration`.
 *
 * Atomic `max_uses` enforcement (a count-then-insert transaction) is a
 * deferred application/RPC concern, not a static constraint — noted here
 * rather than silently assumed solved.
 */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stored normalized (uppercased/trimmed) by whatever writes this row
    // — app-layer discipline, not a DB constraint (Postgres CHECK can't
    // easily express "already uppercase" without also rejecting valid
    // input). The functional unique index below is the real, DB-level
    // guarantee: it catches a case-varied duplicate even if the app-
    // layer normalization is ever bypassed or buggy.
    code: text("code").notNull(),
    description: text("description"),
    type: couponTypeEnum("type").notNull(),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    discountScope: discountScopeEnum("discount_scope").notNull(),
    discountDurationCycles: integer("discount_duration_cycles"),
    maxUses: integer("max_uses"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    check("coupons_value_positive", sql`${t.value} > 0`),
    check(
      "coupons_percent_value_max_100",
      sql`${t.type} != 'percent' OR ${t.value} <= 100`,
    ),
    check(
      "coupons_duration_cycles_consistency",
      sql`(${t.discountScope} = 'fixed_duration' AND ${t.discountDurationCycles} IS NOT NULL) OR (${t.discountScope} != 'fixed_duration' AND ${t.discountDurationCycles} IS NULL)`,
    ),
    // Baseline remediation: added.
    check(
      "coupons_max_uses_positive",
      sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`,
    ),
    check(
      "coupons_duration_cycles_positive",
      sql`${t.discountDurationCycles} IS NULL OR ${t.discountDurationCycles} > 0`,
    ),
    // Baseline remediation: case-insensitive uniqueness — was a plain
    // `.unique()` on `code`, which is case-sensitive in Postgres by
    // default and would let "WELCOME10" and "welcome10" coexist as two
    // distinct, unrelated coupons.
    uniqueIndex("coupons_code_upper_unique").on(sql`upper(${t.code})`),
  ],
);

/** Per-user redemption record — the composite PK is itself the natural
 * "already used this coupon" guard. */
export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.couponId, t.userId] }),
    // The composite PK's leading column is coupon_id, not user_id — a
    // "coupons this user has redeemed" query needs its own index.
    index("coupon_redemptions_user_id_idx").on(t.userId),
  ],
);
