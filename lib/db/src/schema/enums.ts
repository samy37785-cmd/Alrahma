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
 * decoupled from payments (see payments.ts). */
export const providerEventStatusEnum = pgEnum("provider_event_status", [
  "pending",
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

/** Intentionally narrow — old-backend evidence (render.yaml's single
 * BANK_CURRENCY var, Stripe/PayPal both USD-configured) shows no real
 * multi-currency use today. Extend via a real migration when actually
 * needed; do not widen speculatively. */
export const currencyCodeEnum = pgEnum("currency_code", ["USD"]);
