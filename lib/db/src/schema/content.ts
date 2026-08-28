import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/**
 * Was `Blog.js`. `author` was denormalized plain strings (name/role/image),
 * not a ref, in the old schema — kept denormalized here too (editorial
 * content isn't tied to a real account per `.migration-backup/CLAUDE.md`'s
 * "static editorial content" note on the adjacent Teachers directory).
 */
export const blogs = pgTable("blogs", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  authorName: text("author_name"),
  authorRole: text("author_role"),
  authorImage: text("author_image"),
  published: boolean("published").notNull().default(false),
  views: integer("views").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `ContactMessage.js`. */
export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  respondedById: uuid("responded_by_id").references(() => profiles.id, { onDelete: "set null" }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `TrialRequest.js`. */
export const trialRequests = pgTable("trial_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  course: text("course"),
  message: text("message"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Was `Subscriber.js` (newsletter). */
export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("subscribed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Was `TutorConversation.js`. `messages[]` (full embedded chat history) is
 * kept as jsonb — same "nobody queries into a single message relationally"
 * reasoning as `courses.modules`. Token counters carried over as-is (used
 * for the AI Tutor's daily-message-limit accounting in the old backend).
 */
export const tutorConversations = pgTable("tutor_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title"),
  messages: jsonb("messages")
    .$type<Array<{ role: "user" | "assistant"; content: string; createdAt?: string }>>()
    .notNull()
    .default([]),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
