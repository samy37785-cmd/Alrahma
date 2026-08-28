import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/** Was `HifzProgress.js` — one row per (user, surah). */
export const hifzProgress = pgTable("hifz_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").notNull(), // surah 1-114
  chapterName: text("chapter_name").notNull(),
  totalVerses: integer("total_verses").notNull(),
  memorizedVerses: jsonb("memorized_verses").$type<number[]>().notNull().default([]),
  lastRevised: timestamp("last_revised", { withTimezone: true }),
});

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
