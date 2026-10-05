import {
  boolean,
  check,
  index,
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
 * design, plus: can't be published without a timestamp, and (Blog SEO
 * Foundation PR A) every article now carries a `locale` and an optional
 * `translationGroupId` linking it to its counterpart in the other locale. */
export const blogs = pgTable(
  "blogs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    // No longer unique on its own -- see the compound (locale, slug) index
    // below. The same slug is now valid once per locale.
    slug: text("slug").notNull(),
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
    // en/ar only for now (matches backend/models/Blog.js's Mongo-side
    // BLOG_LOCALES) -- the 'en' default is a backward-compatible safety net
    // only; 0 real rows exist today (docs/option-a-mongo-supabase-parity-map.md
    // §9), so it never relabels real content.
    locale: text("locale").notNull().default("en"),
    // Links this article to its counterpart in the other locale for the
    // same topic. Nullable: an article with no translation yet is valid.
    // No FK to blogs.id on purpose -- a translation pair is two independent
    // rows sharing one arbitrary token, not a parent/child relationship, so
    // there is no single row either side could correctly reference.
    translationGroupId: uuid("translation_group_id"),
  },
  (t) => [
    check(
      "blogs_published_requires_timestamp",
      sql`(${t.published} = false) OR (${t.publishedAt} IS NOT NULL)`,
    ),
    check("blogs_locale_allowlist", sql`${t.locale} IN ('en','ar')`),
    uniqueIndex("blogs_locale_slug_unique").on(t.locale, t.slug),
    index("blogs_translation_group_id_idx")
      .on(t.translationGroupId)
      .where(sql`${t.translationGroupId} IS NOT NULL`),
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
    // 0029_preserve_source_dates.sql: nullable, no backfill -- rows that
    // existed before 0029, and migrated documents with no source value, keep
    // NULL ("not known"); new rows get now(). set_updated_at() keeps it current.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
    // 0029_preserve_source_dates.sql: nullable, no backfill -- rows that
    // existed before 0029, and migrated documents with no source value, keep
    // NULL ("not known"); new rows get now(). set_updated_at() keeps it current.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("subscribers_status_allowlist", sql`${t.status} IN ('subscribed','unsubscribed')`),
    // Baseline remediation: case-insensitive uniqueness — was a plain
    // `.unique()` on `email` (case-sensitive by default in Postgres).
    uniqueIndex("subscribers_email_lower_unique").on(sql`lower(${t.email})`),
  ],
);
