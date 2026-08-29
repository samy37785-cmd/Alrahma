import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";

// Note: `contact_messages` and `tutor_conversations` are intentionally
// NOT re-exported here. `contact_messages` was confirmed dead (the
// submit function has zero call sites, no Contact page exists — docs/
// product-scope-audit.md §1); `tutor_conversations` is deferred with the
// rest of AI Tutor (§1), not deleted-forever, but not part of this
// baseline.

/** Public blog content — unchanged shape from the original evidence-based
 * design, plus one addition: can't be published without a timestamp. */
export const blogs = pgTable(
  "blogs",
  {
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
  },
  (t) => [
    check(
      "blogs_published_requires_timestamp",
      sql`(${t.published} = false) OR (${t.publishedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * Admin-curated social proof (docs/product-scope-audit.md §10) —
 * replaces the old user-submitted `reviews` table entirely. No
 * `reviewer_id`, no user-submission flow, no moderation workflow: admin
 * writes and publishes directly, like a blog post.
 */
export const testimonials = pgTable(
  "testimonials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorName: text("author_name").notNull(),
    authorRole: text("author_role"),
    quote: text("quote").notNull(),
    rating: integer("rating"),
    context: text("context"),
    published: boolean("published").notNull().default(false),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Baseline remediation: was missing — `published` mutates.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("testimonials_rating_range", sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 5`)],
);

/**
 * Free-trial lead capture — guest-submittable, no `user_id` (§3).
 * `status` allowlist is real evidence, not guessed: matches the old
 * `TrialRequest.js` Mongoose model exactly
 * (`.migration-backup/backend/models/TrialRequest.js:11`,
 * `enum: ['new', 'contacted', 'scheduled']`, default `'new'`).
 */
export const trialRequests = pgTable(
  "trial_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    course: text("course"),
    message: text("message"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "trial_requests_status_allowlist",
      sql`${t.status} IN ('new','contacted','scheduled')`,
    ),
  ],
);

/**
 * Newsletter signups. `status` is a new addition (the old `Subscriber.js`
 * model had no status field at all — just email); minimal
 * subscribed/unsubscribed pair, matching the unsubscribe-by-signed-link
 * flow assumed in `docs/rls-matrix.md`'s notes.
 */
export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    status: text("status").notNull().default("subscribed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("subscribers_status_allowlist", sql`${t.status} IN ('subscribed','unsubscribed')`),
    // Baseline remediation: case-insensitive uniqueness — was a plain
    // `.unique()` on `email` (case-sensitive by default in Postgres).
    uniqueIndex("subscribers_email_lower_unique").on(sql`lower(${t.email})`),
  ],
);
