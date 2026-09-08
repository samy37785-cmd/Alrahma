import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./auth";
import { accountRoleEnum } from "./enums";

/**
 * Converged, minimal account model (docs/product-scope-audit.md §3, §11).
 * Exactly two kinds of account: `user` and `admin` — no student/teacher/
 * parent/editor/viewer/super-admin from the old system as a `role` VALUE.
 *
 * `role` defaults to `'user'` and is set that way unconditionally by the
 * `handle_new_user()` trigger on `auth.users` insert (hand-authored SQL in
 * the migration, not expressible in this file) — the trigger ignores any
 * `raw_user_meta_data` role claim entirely. Promoting an account to
 * `admin` is a deliberate, out-of-band operation (a direct, audited DB
 * action) — never a signup-time choice and never a client-callable RPC.
 *
 * Stage 2J-B correction: this file previously stopped at the 5 columns
 * `0000_init_20_table_baseline.sql` created and its own doc comment
 * claimed "no gamification, no teacher-only fields" — both no longer
 * true and had not been for some time. `0014_close_partial_gaps_schema.sql`
 * added referral_code/xp/level/streak/last_study_date/badges/teacher_id/
 * parent_link_code/family_name/specialization/bio/gender/languages/
 * subjects and `0018_admin_users_system_and_enrollment_gaps.sql` added
 * is_teacher, as raw SQL never mirrored back into this file — found and
 * fixed while building Stage 2J-B's migration tooling, which needed an
 * accurate picture of every real column here. `subscription_*` columns
 * still deliberately do not exist here — that state lives in
 * `subscriptions` (subscriptions.ts), never denormalized onto the account.
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
    // -- 0014_close_partial_gaps_schema.sql --
    referralCode: text("referral_code"),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    streak: integer("streak").notNull().default(0),
    lastStudyDate: timestamp("last_study_date", { withTimezone: true }),
    badges: jsonb("badges").$type<string[]>().notNull().default([]),
    // The student's assigned teacher (self-referencing profiles.id) — set
    // exclusively via admin_assign_teacher() (0018), which validates the
    // target actually has is_teacher = true.
    teacherId: uuid("teacher_id").references((): AnyPgColumn => profiles.id, {
      onDelete: "set null",
    }),
    parentLinkCode: text("parent_link_code"),
    familyName: text("family_name"),
    specialization: text("specialization"),
    bio: text("bio"),
    gender: text("gender"),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
    // -- 0018_admin_users_system_and_enrollment_gaps.sql --
    // Purely relational, not a `role` value (see admin_set_teacher_flag()'s
    // own doc comment, 0018) — set exclusively via that RPC.
    isTeacher: boolean("is_teacher").notNull().default(false),
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
