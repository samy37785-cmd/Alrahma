import { pgEnum } from "drizzle-orm/pg-core";

// Shared Postgres enums for the 20-table minimal baseline
// (docs/product-scope-audit.md). Grouped here rather than per-table file
// to avoid duplicate `CREATE TYPE` definitions across files that share
// one (e.g. `payment_gateway` is used by both `payments` and
// `subscriptions`).

/** Exactly two account kinds — never the old system's student/teacher/
 * parent/editor/viewer/super-admin. `admin` is only ever set out-of-band
 * (see profiles.ts's trigger comment) — never via signup or client RPC. */
export const accountRoleEnum = pgEnum("account_role", ["user", "admin"]);

export const paymentGatewayEnum = pgEnum("payment_gateway", [
  "stripe",
  "paypal",
  "manual",
]);

/** A `payments` row is either the charge itself or a refund of one —
 * never a status flip on the original row (see payments.ts). */
export const paymentKindEnum = pgEnum("payment_kind", ["charge", "refund"]);

/** Deliberately small — the only allowed transitions are
 * pending→succeeded and pending→failed, enforced by a trigger in the
 * migration (not expressible as a plain CHECK, since it depends on the
 * OLD row). Once succeeded/failed, a payments row is frozen. */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const manualPaymentStatusEnum = pgEnum("manual_payment_status", [
  "pending",
  "approved",
  "rejected",
]);

/** Stripe rows use the full lifecycle; PayPal/manual rows are a one-shot
 * fixed-period grant (see subscriptions.ts) — `active`/`expired` cover
 * that case without claiming auto-renew. */
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "expired",
]);

/** provider_events' own lifecycle — the real webhook idempotency ledger,
 * decoupled from payments (see payments.ts). `processing` is the
 * reserved-but-not-yet-resolved state: `claim_provider_event()` does the
 * atomic `pending → processing` claim BEFORE any side-effect work runs,
 * so two workers racing the same delivery can't both perform it; a
 * separate `complete_provider_event()` does `processing →
 * processed/failed` once the work is actually done. (Baseline
 * remediation: the first version of this claim function collapsed
 * "claim" and "record outcome" into one post-hoc call, which didn't
 * actually prevent a race — see 0001_functions_triggers.sql.) */
export const providerEventStatusEnum = pgEnum("provider_event_status", [
  "pending",
  "processing",
  "processed",
  "failed",
  "ignored",
]);

/** LMS-free — replaces the old system's class/homework/message-shaped
 * notification types entirely. */
export const notificationTypeEnum = pgEnum("notification_type", [
  "payment_received",
  "payment_failed",
  "subscription_renewed",
  "subscription_expiring",
  "trial_status",
  "admin_announcement",
  "daily_reminder",
]);

export const discountScopeEnum = pgEnum("discount_scope", [
  "first_payment_only",
  "fixed_duration",
  "forever",
]);

export const couponTypeEnum = pgEnum("coupon_type", ["percent", "fixed"]);

/** `invoices`' own lifecycle — real evidence, not guessed: matches the
 * old `Invoice.js` Mongoose model's exact vocabulary
 * (`.migration-backup/backend/models/Invoice.js:18`,
 * `enum: ['paid', 'pending', 'cancelled']`). */
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "paid",
  "cancelled",
]);

/** Baseline remediation: was `['USD']` on old-backend evidence
 * (`render.yaml`'s `BANK_CURRENCY`) that turned out to not even exist
 * inside the live app's own directory and had no literal value in the
 * repo at all. Re-verified directly against the live app
 * (`artifacts/al-rahma-academy`): `Pricing.jsx`'s canonical/base price
 * is EUR (USD is a client-side display-only conversion that never
 * reaches an actual charge — `CheckoutModal.jsx` hardcodes `€` on the
 * pay button regardless), and `TermsOfService.jsx` states outright,
 * across all 6 locales, that prices are in EUR (VAT-inclusive) — a
 * contractual statement, not a UI nicety. Corroborated by a second,
 * independent source: the actual operated backend's env file (outside
 * version control) sets `BANK_CURRENCY=EUR`. Still intentionally
 * narrow — a single real currency, not guessed wider than this
 * evidence shows (the USD toggle is cosmetic, so it doesn't count as
 * real multi-currency use). Extend via a real migration when the
 * product genuinely takes real payments in more than one currency. */
export const currencyCodeEnum = pgEnum("currency_code", ["EUR"]);
