import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Supabase-managed `auth.users` table. We never create or migrate this —
 * Supabase Auth owns it. This is just enough of a reference for our own
 * tables' foreign keys (`profiles.id`, every `*_user_id` column, etc.) to
 * point at it and for Drizzle to generate correct FK constraints.
 *
 * See docs/adr/0001-supabase-auth-convergence.md (to be written in Stage 3)
 * for why regular users AND admins both live in this one table (role column
 * on `profiles`, not a separate admin collection) — see
 * docs/render-to-supabase-migration.md for the full audit this is based on.
 */
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});
