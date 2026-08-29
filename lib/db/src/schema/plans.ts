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
 *
 * RLS Remediation Round 3 (Section E): the plain `.unique()` on `slug`
 * used to make the paragraph above structurally impossible — two rows
 * can never share a slug while one is flat-unique, so "a new row reuses
 * the same slug once the old one is deactivated" had no real path.
 * `plans_slug_active_unique` below (partial, `WHERE active`) is the
 * actual fix: any number of INACTIVE rows may share a slug (full
 * version history), but at most one ACTIVE row per slug ever exists —
 * enforced by Postgres itself, not just by `create_plan_version()`'s own
 * discipline (a real backstop against two concurrent version-creation
 * calls both succeeding). `amount_minor`/`currency`/`stripe_product_id`/
 * `stripe_price_id`/`paypal_plan_id`/`slug`/`version` are now enforced
 * immutable on any existing row by `enforce_plan_immutability()`
 * (`0008_plan_versioning.sql`) — genuinely, not just by convention; the
 * raw admin UPDATE/INSERT policies are dropped in that same migration.
 * `name`/`billing_interval`/`sessions_per_week`/`sessions_per_month` are
 * catalog-defining, same as the financial columns, so they follow the
 * same discipline: create a new version to change them, no in-place
 * edit path exists. `display_order`/`active` are lifecycle/cosmetic, not
 * catalog-defining — `admin_update_plan_display()`/`deactivate_plan()`
 * are the narrow, real edit paths for those two.
 *
 * RLS Remediation Round 4: a real gap in Round 3's own fix —
 * `plans_slug_active_unique` only guards ACTIVE rows, so
 * `create_plan_version(NULL, slug, ...)` (the brand-new-plan path) could
 * be called again for a slug that already has a deactivated history,
 * silently minting a second, unrelated "version 1" row under the same
 * slug. `plans_slug_version_unique` below is the real DB-level backstop
 * — no two rows may ever share a `(slug, version)` pair, active or not —
 * and `create_plan_version()` (`0010_round4_integrity_fixes.sql`) now
 * also rejects the brand-new-plan path outright when the slug already
 * has ANY row, directing the caller to version the existing (possibly
 * inactive) plan instead. Same defense-in-depth discipline as everywhere
 * else in this schema: a real RPC-level check plus a real index, neither
 * one alone.
 */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: currencyCodeEnum("currency").notNull().default("EUR"),
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
    // The real "no more than one active version per slug" guarantee —
    // replaces the old flat unique(slug), which made versioning under
    // the same slug structurally impossible (see the table doc comment).
    uniqueIndex("plans_slug_active_unique").on(t.slug).where(sql`${t.active} = true`),
    // RLS Remediation Round 4: the real DB-level "no duplicate version"
    // guarantee — plans_slug_active_unique alone only ever guards the
    // single active row, so a slug's inactive history could otherwise
    // grow two unrelated rows both claiming version 1 (or any other
    // version number colliding).
    uniqueIndex("plans_slug_version_unique").on(t.slug, t.version),
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
