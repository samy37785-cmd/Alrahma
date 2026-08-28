import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { courses } from "./courses";

/**
 * Was `Message.js`. Independent of `notifications` below — the old backend
 * deliberately kept the Messages badge (`unread/count` here) and the
 * Notification bell as two separate tables/endpoints; preserved as-is.
 */
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromId: uuid("from_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  toId: uuid("to_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `Notification.js`. `meta` stays jsonb (was Mongo `Mixed`). */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `Review.js`. `targetType` distinguishes a teacher-review from a
 * course-review — the old schema had two possible target refs (teacher or
 * course); kept as an explicit discriminator column instead of two nullable
 * FKs guessed apart at read time. */
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(), // 'teacher' | 'course'
  targetTeacherId: uuid("target_teacher_id").references(() => profiles.id, { onDelete: "cascade" }),
  targetCourseId: uuid("target_course_id").references(() => courses.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  status: text("status").notNull().default("pending"), // moderation
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `Post.js` (community feed). `likes[]` moves to `post_likes` join
 * table for the same reason as coupon redemptions — a per-user "did I like
 * this" RLS check. */
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"), // moderation
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postLikes = pgTable("post_likes", {
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
});

/** Was `Comment.js`. */
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `Wishlist.js` — one row per user, `items[]` was an embedded array of
 * {course, addedAt}; normalized here into its own join table so a single
 * add/remove is a plain insert/delete, not a document rewrite. */
export const wishlistItems = pgTable("wishlist_items", {
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});
