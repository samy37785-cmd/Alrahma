import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { currencyCodeEnum } from "./enums";

/**
 * Admin-managed pricing catalog (docs/product-scope-audit.md §4) — NOT an
 * LMS `courses` table. Marketing course content stays static/code-level;
 * this is pricing/catalog data only, read server-side and verified
 * against the payment provider's own price ID. The frontend never sends
 * a trusted amount.
 *
 * A price change creates a NEW row (or at least a new provider price) and
 * deactivates the old one — a historical price is never edited in place.
 * `version` is human-facing metadata for that discipline, not a rewrite
 * mechanism; the real immutability guarantee is that `payments`/
 * `invoices` snapshot the price at time of payment (see payments.ts),
 * so a later change here never reinterprets historical financial rows.
 */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: currencyCodeEnum("currency").notNull().default("USD"),
    billingInterval: text("billing_interval"), // e.g. 'month'
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    paypalPlanId: text("paypal_plan_id"),
    sessionsPerWeek: integer("sessions_per_week"),
    sessionsPerMonth: integer("sessions_per_month"),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("plans_amount_minor_nonneg", sql`${t.amountMinor} >= 0`),
    // Unique only when set — several plans can share a null provider id
    // during setup without a false unique-constraint conflict, but no two
    // real provider price/plan IDs are ever allowed to collide.
    uniqueIndex("plans_stripe_price_id_unique")
      .on(t.stripePriceId)
      .where(sql`${t.stripePriceId} IS NOT NULL`),
    uniqueIndex("plans_paypal_plan_id_unique")
      .on(t.paypalPlanId)
      .where(sql`${t.paypalPlanId} IS NOT NULL`),
  ],
);
