import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./auth";
import { accountRoleEnum } from "./enums";

/**
 * Converged, minimal account model (docs/product-scope-audit.md §3, §11).
 * Exactly two kinds of account: `user` and `admin` — no student/teacher/
 * parent/editor/viewer/super-admin from the old system.
 *
 * `role` defaults to `'user'` and is set that way unconditionally by the
 * `handle_new_user()` trigger on `auth.users` insert (hand-authored SQL in
 * the migration, not expressible in this file) — the trigger ignores any
 * `raw_user_meta_data` role claim entirely. Promoting an account to
 * `admin` is a deliberate, out-of-band operation (a direct, audited DB
 * action) — never a signup-time choice and never a client-callable RPC.
 *
 * No gamification (xp/level/streak/badges), no teacher-only fields, no
 * `subscription_*` columns here — subscription state lives in
 * `subscriptions` (subscriptions.ts), not denormalized onto the account.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: accountRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Baseline remediation: `profiles.email` had no uniqueness guarantee
    // at all. Supabase Auth itself enforces uniqueness on `auth.users`,
    // but that's a different table/system — this is our own table's own
    // defensive guarantee, case-insensitive (same reasoning as
    // `coupons.code`/`subscribers.email`).
    uniqueIndex("profiles_email_lower_unique").on(sql`lower(${t.email})`),
  ],
);
