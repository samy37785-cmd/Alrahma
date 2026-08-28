import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";
import { plans } from "./plans";
import { paymentGatewayEnum, subscriptionStatusEnum } from "./enums";

/**
 * Current subscription state per user (docs/product-scope-audit.md §7) —
 * separate from `payments`, which is a transaction-attempt log, not a
 * state machine. `user_id` is NOT NULL: starting any paid checkout
 * requires a logged-in account (§3).
 *
 * Stripe rows are true auto-renewing subscriptions; PayPal (current
 * Orders-API integration) and manual-payment rows use the exact same
 * columns to represent a one-shot fixed-period grant instead —
 * `cancel_at_period_end`/`canceled_at` simply don't apply meaningfully to
 * those two, and the row just expires at `current_period_end` unless a
 * new payment extends it. This table does not claim auto-renew for
 * PayPal/manual.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    provider: paymentGatewayEnum("provider").notNull(),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    status: subscriptionStatusEnum("status").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_subscription_id_unique")
      .on(t.providerSubscriptionId)
      .where(sql`${t.providerSubscriptionId} IS NOT NULL`),
    // The hard guarantee against two conflicting active subscriptions for
    // one user — a partial unique index, not application-level checking.
    uniqueIndex("subscriptions_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  ],
);
