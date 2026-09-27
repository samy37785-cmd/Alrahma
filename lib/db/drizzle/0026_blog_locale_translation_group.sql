-- Blog SEO Foundation PR A (Localized Article Data Model + Public API
-- Locale Contract): adds the two columns needed to keep EN and AR articles
-- as independent records that can optionally be linked to each other, and
-- moves slug uniqueness from global to per-locale. Mirrors the Mongo-side
-- change in backend/models/Blog.js (BLOG_LOCALES, translationGroupId, the
-- (locale, slug) compound unique index) so both backends implement the
-- exact same contract — see docs/option-a-mongo-supabase-parity-map.md §9.
--
-- Safe with zero backfill: 0 real rows exist in `blogs` today on either
-- backend (confirmed live via GET /api/blog on production, and documented
-- independently in docs/option-a-mongo-supabase-parity-map.md §9's "0 real
-- Mongo blog documents exist today"). The 'en' default below is a
-- backward-compatible safety net for any future caller that omits
-- `locale`, not a claim that pre-existing content is English.
--
-- Hand-written, not `drizzle-kit generate`-produced, for the same reason
-- documented in 0025_booking_first_enrollment.sql: this project's
-- meta/*.json snapshots already drifted out of sync with src/schema/
-- before this change (0013-0022, 0025), so running the generator here
-- would only reproduce that unrelated pre-existing backlog. Regenerating
-- the snapshots to close that drift is a separate, unrelated
-- migration-tooling task, out of scope for this PR.
--
-- NOT applied to any database by this change -- added for review only, to
-- be applied by the project's own migration process.

ALTER TABLE "blogs" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_locale_allowlist" CHECK ("blogs"."locale" IN ('en','ar'));--> statement-breakpoint

-- Links this article to its counterpart in the other locale for the same
-- topic. Nullable: an article with no translation yet is valid. No FK to
-- blogs.id -- a translation pair is two independent rows sharing one
-- arbitrary token, not a parent/child relationship, so neither side is
-- structurally "the" row the other must reference.
ALTER TABLE "blogs" ADD COLUMN "translation_group_id" uuid;--> statement-breakpoint
CREATE INDEX "blogs_translation_group_id_idx" ON "blogs" USING btree ("translation_group_id") WHERE "translation_group_id" IS NOT NULL;--> statement-breakpoint

-- Slug uniqueness moves from global to per-locale: the same slug is now
-- valid once per locale (an EN and an AR article about the same topic can
-- share it), matching the Mongo-side index change exactly.
ALTER TABLE "blogs" DROP CONSTRAINT "blogs_slug_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "blogs_locale_slug_unique" ON "blogs" USING btree ("locale","slug");--> statement-breakpoint
