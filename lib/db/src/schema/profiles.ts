import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";

/**
 * Converged auth model (Stage 1/3 of docs/render-to-supabase-migration.md):
 * one `auth.users` table for EVERYONE, including admins — no separate
 * AdminUser collection/JWT/cookie set like the old Express backend had.
 * `profiles.role = 'admin'` + Supabase's native MFA (AAL2) + the RLS
 * policies in Stage 2 is what used to be a whole parallel auth system.
 *
 * Old system reference (`.migration-backup/backend/models/User.js` +
 * `AdminUser.js`) — every field below traces back to one of those two.
 */
export const roleEnum = pgEnum("role", ["student", "teacher", "parent", "admin"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "none",
  "active",
  "past_due",
  "canceled",
]);

export const subscriptionProviderEnum = pgEnum("subscription_provider", [
  "stripe",
  "paypal",
  "manual",
]);

export const profiles = pgTable("profiles", {
  // Same id as auth.users.id — a profile row is created by the
  // handle_new_user() trigger (Stage 1) the moment someone signs up.
  id: uuid("id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("student"),

  // ── Parent/child linking (was User.children[] + parentLinkCode) ──────
  familyName: text("family_name"),
  parentLinkCode: text("parent_link_code").unique(),

  // ── Teacher assignment (was User.teacher ref) ─────────────────────────
  teacherId: uuid("teacher_id"),

  // ── Teacher-only profile fields ───────────────────────────────────────
  teacherSpecialization: text("teacher_specialization"),
  teacherBio: text("teacher_bio"),
  teacherGender: text("teacher_gender"),
  teacherLanguages: jsonb("teacher_languages").$type<string[]>(),
  teacherSubjects: jsonb("teacher_subjects").$type<string[]>(),
  teacherRating: numeric("teacher_rating", { precision: 3, scale: 2 }),

  // ── Gamification (was User.xp/level/streak/badges) ────────────────────
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  streak: integer("streak").notNull().default(0),
  badges: jsonb("badges").$type<string[]>().notNull().default([]),

  // ── Referrals ──────────────────────────────────────────────────────────
  referralCode: text("referral_code").unique(),

  // ── Subscription (was User.subscription{...}) ────────────────────────
  subscriptionPlan: text("subscription_plan"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("none"),
  subscriptionProvider: subscriptionProviderEnum("subscription_provider"),
  subscriptionValidUntil: timestamp("subscription_valid_until", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Idempotency guard for the renewal-reminder cron (ported as-is from the
  // old `User.subscription.renewalReminderSentFor` field).
  renewalReminderSentFor: timestamp("renewal_reminder_sent_for", { withTimezone: true }),

  // ── Admin-only fields (was AdminUser.extraPermissions/isActive/...) ───
  // Base role→permission mapping stays in application code (mirrors the
  // old ROLE_PERMISSIONS constant); this column is only the additive,
  // per-account extra grants (was AdminUser.extraPermissions).
  extraPermissions: jsonb("extra_permissions").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // GDPR-anonymized (last octet/group masked) — never store a full IP here,
  // matching the old backend's anonymizeIp() discipline.
  lastLoginIpAnon: text("last_login_ip_anon"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Parent↔child links (was `User.children: [ObjectId]` on the parent doc).
 * A join table instead of an array column: cleaner RLS (a parent can only
 * see rows where parent_id = auth.uid()) and cleaner integrity than a
 * jsonb/uuid[] column referencing another table's rows.
 */
export const profileChildren = pgTable(
  "profile_children",
  {
    parentId: uuid("parent_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.parentId, t.childId] })],
);

/**
 * Admin sign-in lockout (was `AdminUser.failedLoginAttempts`/`lockedUntil`).
 * Supabase Auth has no native per-account lockout, so the admin-login Edge
 * Function (Stage 3) checks/updates this table BEFORE calling Supabase
 * Auth's own sign-in — keyed by email since the caller doesn't have a user
 * id yet at the point a lockout must be checked (pre-authentication).
 */
export const adminLockouts = pgTable("admin_lockouts", {
  email: text("email").primaryKey(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
