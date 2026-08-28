import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/**
 * Was `SystemConfig.js`. `financials_frozen` (read by the old
 * `financialGuard` middleware) is the one key already known to be read at
 * runtime — ported to a plain Postgres row + RLS-gated read/write rather
 * than the old app-level `encrypted` flag/AES field, since Supabase-side
 * secrets belong in Edge Function secrets, not an app-encrypted DB column.
 */
export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value"),
  description: text("description"),
  updatedById: uuid("updated_by_id").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Was `SystemAuditLog.js`. `before`/`after`/`metadata` stay jsonb (was
 * Mongo `Mixed`) — this table is intentionally append-only (no RLS UPDATE/
 * DELETE policy should ever be written for it in Stage 2).
 */
export const systemAuditLog = pgTable("system_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").references(() => profiles.id, { onDelete: "set null" }),
  adminEmail: text("admin_email"), // denormalized, survives the admin account being deleted
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ipAnon: text("ip_anon"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * NEW — was Redis (rate-limit store only) in the old backend. Replaces
 * `express-rate-limit` + optional `ioredis`/`rate-limit-redis` with plain
 * windowed counters, per the locked Stage-0 decision (no new external
 * service). Each limiter (admin login, MFA, payments webhook, AI tutor,
 * ...) upserts+increments a row keyed by (bucket, window_start) inside its
 * Edge Function and rejects once `count` exceeds that bucket's limit —
 * mirrors the old `rl:auth:`/`rl:ai-tutor:` prefix-per-limiter scheme.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    bucket: text("bucket").notNull(), // e.g. 'admin_login:203.0.113.4' or 'ai_tutor:<user_id>'
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);
