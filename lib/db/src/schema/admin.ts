import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/**
 * Append-only admin action log (docs/product-scope-audit.md §6) — the
 * concrete, testable record of every admin-performed mutation (manual
 * payment approval/rejection, testimonial publish, role promotion, etc).
 * Independent of, and a second layer ahead of, RLS/grants (not built this
 * pass): a `BEFORE UPDATE OR DELETE` trigger (`forbid_audit_log_mutation()`,
 * hand-authored SQL in the migration — not expressible in this file) makes
 * every row immutable once written, regardless of who's connecting.
 *
 * `before`/`after` are free-form jsonb snapshots of the affected row's
 * state. They must never contain passwords/tokens/full payment gateway
 * payloads/full IPs — that's enforced by whatever application code writes
 * to this table (a discipline, not a DB constraint; Postgres can't know
 * what a JSON blob "means"). `correlation_id` is optional — lets several
 * audit rows from one logical admin action (e.g. approve + notify) be
 * tied together later without a hard FK relationship.
 */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorAdminId: uuid("actor_admin_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Baseline remediation: was missing — "this admin's own action
    // history" is an expected RLS-scoped query.
    index("admin_audit_log_actor_admin_id_idx").on(t.actorAdminId),
  ],
);
