// Postgres/Supabase schema for the Render→Supabase migration
// (docs/render-to-supabase-migration.md, Stage 1). Ported field-by-field
// from the 31 Mongoose models in `.migration-backup/backend/models/` per
// the migration audit — see each file's own doc comments for the mapping
// from its old Mongo model name.
//
// `auth.users` is Supabase-managed and never created/migrated by us
// (see ./auth.ts). Every other table here is created by Stage 1's
// migration and locked down by Stage 2's RLS policies — nothing in this
// file is wired to a live app yet.

export * from "./auth";
export * from "./profiles";
export * from "./courses";
export * from "./quran";
export * from "./payments";
export * from "./social";
export * from "./content";
export * from "./system";
