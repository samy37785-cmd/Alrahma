import {
  boolean,
  check,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";
import { notificationTypeEnum } from "./enums";

/**
 * In-app notifications (docs/product-scope-audit.md §5) — restored from
 * DROP, re-scoped away from the old LMS event types entirely. Users only
 * ever read/mark their own rows; only admin/system processes create rows
 * (an RLS concern for later, but the schema already has no ambiguity:
 * every row has exactly one `user_id` recipient).
 *
 * `scheduled_for` lets a `daily_reminder` row be created ahead of its
 * send time. `dedupe_key` + the partial unique index below is what
 * actually prevents a double-fired reminder job from creating two rows
 * for the same user/day at the DATABASE level — application logic isn't
 * trusted alone. The scheduler/cron that would actually enqueue
 * `daily_reminder` rows is explicitly NOT part of this baseline; this
 * table only guarantees a duplicate INSERT is rejected if one is
 * attempted.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    // Must be a same-origin relative path, never an external URL — that
    // rule is app-layer (Postgres can't validate "same origin").
    link: text("link"),
    read: boolean("read").notNull().default(false),
    meta: jsonb("meta"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_user_dedupe_unique")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} IS NOT NULL`),
  ],
);

/**
 * Per-user notification settings — one row per user. In-app only for
 * now; no push-token/device table (a later decision, not built
 * speculatively).
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    dailyReminderEnabled: boolean("daily_reminder_enabled").notNull().default(false),
    dailyReminderTime: time("daily_reminder_time"),
    // Expected to be an IANA name (e.g. "Africa/Cairo") — validity is
    // checked app-side, not a DB constraint.
    timezone: text("timezone"),
    // Narrowed to the 2 languages the active app's evidence actually
    // supports today — extend when the real language list is confirmed,
    // not guessed at the old system's 6.
    language: text("language"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("notification_preferences_language_allowlist", sql`${t.language} IS NULL OR ${t.language} IN ('en','ar')`)],
);
