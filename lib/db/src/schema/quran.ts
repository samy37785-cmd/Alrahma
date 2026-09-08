import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Note: `hifz_progress` (the old HifzProgress.js model) is intentionally
// NOT re-exported here — it was a teacher-assessed record tied to the
// cut teacher/student system (docs/product-scope-audit.md §12, DROP
// list). The 3 tables below are pure per-user tool progress, unrelated
// to any teacher relationship, and stay.

/**
 * Was `QuranBookmark.js`. Baseline remediation:
 * `unique(user_id, verse_key)` added — re-verified directly against the
 * live app (not assumed): `Quran.jsx`'s `toggleBookmark`/`saveNote`/
 * `setHighlight` and the API client's `removeBookmark(verseKey)` (no
 * bookmark id) only make sense with one row per verse per user, and the
 * historical Mongoose model had exactly this as a real unique index
 * (`.migration-backup/backend/models/QuranBookmark.js:20`) plus an
 * upsert-by-`(user, verseKey)` controller. This index doubles as the
 * ownership-scoped lookup index (`user_id` is its leading column), so a
 * separate plain index on `user_id` alone would be redundant — skipped
 * deliberately, not missed.
 */
export const quranBookmarks = pgTable(
  "quran_bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    verseKey: text("verse_key").notNull(),
    chapterId: integer("chapter_id").notNull(),
    verseNum: integer("verse_num").notNull(),
    note: text("note"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("quran_bookmarks_user_verse_unique").on(t.userId, t.verseKey)],
);

/**
 * Was `QuranReadingProgress.js` — one row per user (unique). `resume` and
 * the daily history array are kept as jsonb, matching the old embedded
 * shape; nothing queries into their internals relationally today.
 */
export const quranReadingProgress = pgTable("quran_reading_progress", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  resume: jsonb("resume").$type<{
    navMode?: string;
    chapterId?: number;
    pageNum?: number;
    juzNum?: number;
    hizbNum?: number;
    verseKey?: string;
    verseTimestamp?: number;
  }>(),
  goal: integer("goal"),
  // Stage 2J-B (0022_lossless_migration_support.sql): the old Mongo model
  // (QuranReadingProgress.js) tracked a goal TYPE alongside its target —
  // `goal` above is, and remains, the target only.
  goalType: text("goal_type"),
  streak: integer("streak").notNull().default(0),
  // Stage 2J-B (0022): the old model's streak.longest — `streak` above
  // is, and remains, the CURRENT streak only.
  longestStreak: integer("longest_streak").notNull().default(0),
  // Stage 2J-B (0022): the old model's streak.lastReadDate, kept as the
  // exact 'YYYY-MM-DD' text it was stored as (no date-type reinterpretation).
  lastReadDate: text("last_read_date"),
  history: jsonb("history").$type<Array<{ date: string; [key: string]: unknown }>>()
    .notNull()
    .default([]),
});

/** Was `QuranMemorizationStats.js` — one row per user (unique). */
export const quranMemorizationStats = pgTable("quran_memorization_stats", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  goal: integer("goal"),
  // Stage 2J-B (0022): see quranReadingProgress.goalType above — same
  // reasoning, this table's own old model also tracked a goal type.
  goalType: text("goal_type"),
  totalRecordings: integer("total_recordings").notNull().default(0),
  totalPracticeTime: integer("total_practice_time").notNull().default(0), // seconds
  streak: integer("streak").notNull().default(0),
  // Stage 2J-B (0022): see quranReadingProgress.longestStreak above.
  longestStreak: integer("longest_streak").notNull().default(0),
  // Stage 2J-B (0022): the old model's stats.lastPracticeDate, same
  // 'YYYY-MM-DD' text discipline as quranReadingProgress.lastReadDate.
  lastPracticeDate: text("last_practice_date"),
});
