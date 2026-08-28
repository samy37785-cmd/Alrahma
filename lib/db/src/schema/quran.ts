import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Note: `hifz_progress` (the old HifzProgress.js model) is intentionally
// NOT re-exported here — it was a teacher-assessed record tied to the
// cut teacher/student system (docs/product-scope-audit.md §12, DROP
// list). The 3 tables below are pure per-user tool progress, unrelated
// to any teacher relationship, and stay.

/** Was `QuranBookmark.js`. */
export const quranBookmarks = pgTable("quran_bookmarks", {
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
});

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
  streak: integer("streak").notNull().default(0),
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
  totalRecordings: integer("total_recordings").notNull().default(0),
  totalPracticeTime: integer("total_practice_time").notNull().default(0), // seconds
  streak: integer("streak").notNull().default(0),
});
