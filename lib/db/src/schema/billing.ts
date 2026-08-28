import {
  boolean,
  check,
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
import { currencyCodeEnum, discountScopeEnum, manualPaymentStatusEnum, couponTypeEnum } from "./enums";

/**
 * A single period's proof-of-payment for admin review (docs/product-
 * scope-audit.md §7). `user_id` NOT NULL — paid checkout requires login.
 * Activating the corresponding `subscriptions` row happens ONLY via a
 * separately-designed, atomic RPC after admin approval (deferred — not
 * built in this pass; see the doc's §14). That RPC must do an atomic
 * `pending → approved` claim (`UPDATE ... WHERE status = 'pending'`) so a
 * record can never be approved twice — this table's `status` column
 * shape already supports that correctly.
 */
export const manualPayments = pgTable("manual_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  requestedPlanSlug: text("requested_plan_slug"),
  amountMinor: integer("amount_minor").notNull(),
  currencySnapshot: currencyCodeEnum("currency_snapshot").notNull().default("USD"),
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
});

/**
 * Receipts. Independent snapshots so an invoice's historical content
 * never shifts if `plans`/`profiles` change later — same discipline as
 * `payments`' snapshot fields.
 */
export const invoices = pgTable("invoices", {
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
  currencySnapshot: currencyCodeEnum("currency_snapshot").notNull().default("USD"),
  status: text("status").notNull().default("issued"),
  gatewayInvoiceId: text("gateway_invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("invoices_gateway_invoice_id_unique")
    .on(t.gatewayInvoiceId)
    .where(sql`${t.gatewayInvoiceId} IS NOT NULL`),
]);

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
    // — not enforced at the DB level, since Postgres CHECK can't easily
    // express "already uppercase" without also rejecting valid input.
    code: text("code").notNull().unique(),
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
  (t) => [primaryKey({ columns: [t.couponId, t.userId] })],
);
