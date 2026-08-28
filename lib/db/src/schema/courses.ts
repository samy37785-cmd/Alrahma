import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/**
 * Courses (was `Course.js`). `modules`/`lessons`/legacy `resources` were
 * nested Mongo subdocuments — kept as jsonb here rather than normalized
 * into child tables, per the migration audit's "JSONB where genuinely
 * document-shaped" call: nobody queries into a single lesson relationally
 * today (the frontend always reads a whole course), so normalizing would
 * add join complexity with no real benefit. Revisit only if that changes.
 */
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  icon: text("icon"),
  price: numeric("price", { precision: 10, scale: 2 }),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  // Legacy flat resource links, pre-modules — kept for content still using it.
  resources: jsonb("resources").$type<Array<{ type: string; url: string; title?: string }>>(),
  // modules: [{ title, lessons: [{ title, type, url, content, resources[] }] }]
  modules: jsonb("modules").$type<unknown[]>().notNull().default([]),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `CourseProgress.js`. */
export const courseProgress = pgTable("course_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  // Completed resource URLs — kept as a simple array like the old doc since
  // it's an unordered "seen set", not something queried by index.
  completed: jsonb("completed").$type<string[]>().notNull().default([]),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
});

/**
 * Public enrollment/lead-capture form (was `Enrollment.js`). Deliberately
 * has no `user_id` — it's filled out before an account necessarily exists,
 * exactly like today.
 */
export const enrollments = pgTable("enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  whatsapp: text("whatsapp"),
  country: text("country"),
  city: text("city"),
  timezone: text("timezone"),
  lang: text("lang"),
  level: text("level"),
  ageGroup: text("age_group"),
  genderPref: text("gender_pref"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `Certificate.js`. `certificateNumber` (CERT-YYYY-NNNN) generation
 * moves from the old Mongo `Counter.js` helper to a Postgres sequence. */
export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  certificateNumber: text("certificate_number").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  issuedBy: uuid("issued_by").references(() => profiles.id, { onDelete: "set null" }),
  grade: text("grade"),
  notes: text("notes"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  revoked: boolean("revoked").notNull().default(false),
});

/**
 * Per-session teacher notes (was `StudentRecord.js`) — Hifz range
 * (memoFrom/memoTo), muraja'a review, tajweed, homework, attendance.
 */
export const studentRecords = pgTable("student_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  grade: numeric("grade", { precision: 5, scale: 2 }),
  gradeLabel: text("grade_label"),
  attendance: text("attendance"),
  memoFrom: text("memo_from"),
  memoTo: text("memo_to"),
  review: text("review"),
  tajweed: text("tajweed"),
  homework: text("homework"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `LiveClass.js`. */
export const liveClasses = pgTable("live_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull(),
  meetingUrl: text("meeting_url"),
  notes: text("notes"),
  status: text("status").notNull().default("scheduled"),
});
