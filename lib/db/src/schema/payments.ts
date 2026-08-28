import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/**
 * Was `Payment.js`. `gatewayOrderId` stays unique — that uniqueness IS the
 * idempotency mechanism the old Stripe/PayPal webhook handlers relied on
 * (`findOneAndUpdate({gatewayOrderId, status:{$ne:'paid'}})`); the Stage-4
 * Edge Functions port that to a Postgres
 * `UPDATE ... WHERE gateway_order_id = $1 AND status != 'paid' RETURNING *`
 * against this same constraint — see docs/render-to-supabase-migration.md.
 */
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  plan: text("plan").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  couponCode: text("coupon_code"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }),
  gateway: text("gateway").notNull(), // 'stripe' | 'paypal'
  method: text("method"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default("pending"),
  gatewayOrderId: text("gateway_order_id").notNull().unique(),
  gatewayTxnId: text("gateway_txn_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Last raw gateway payload — jsonb, same "keep the evidence" purpose as
  // the old Mongo `raw: Mixed` field.
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Was `ManualPayment.js`. Approve/reject is a plain RLS-gated admin UPDATE
 * (no Edge Function needed) but still needs the same atomic
 * `WHERE status = 'pending'` claim pattern the old code used, to avoid a
 * double-approve race — enforce that in the RLS/RPC written in Stage 2,
 * not just in application code.
 */
export const manualPayments = pgTable("manual_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  plan: text("plan").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  method: text("method").notNull(), // wu | moneygram | payoneer | bank | paypal_manual
  couponCode: text("coupon_code"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  reference: text("reference"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

/** Was `Invoice.js`. `gatewayInvoiceId` unique = renewal-webhook dedupe key. */
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull(),
  plan: text("plan").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  originalAmount: numeric("original_amount", { precision: 10, scale: 2 }),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  billingPeriod: text("billing_period"),
  status: text("status").notNull().default("issued"),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
  gatewayInvoiceId: text("gateway_invoice_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `Coupon.js`. `usedBy[]` (embedded array of {user, usedAt}) moves to
 * the `couponRedemptions` join table below — cleaner for a per-user
 * "did I already use this coupon" RLS check than scanning a jsonb array. */
export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: text("type").notNull(), // 'percent' | 'fixed'
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  maxUses: integer("max_uses"),
  applicablePlans: jsonb("applicable_plans").$type<string[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
});

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

/** Was `Referral.js`. */
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  refereeId: uuid("referee_id").references(() => profiles.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  status: text("status").notNull().default("pending"),
  rewardAmount: numeric("reward_amount", { precision: 10, scale: 2 }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
});
