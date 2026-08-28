// Postgres/Supabase schema — the locked 20-table minimal baseline
// (docs/product-scope-audit.md, Product Scope Closure v3). The old
// 34-table LMS/teacher/parent/student schema (Stage 1, superseded) has
// been fully replaced; nothing in this directory exports any of the 20
// dropped tables anymore.
//
// `auth.users` is Supabase-managed and never created/migrated by us (see
// ./auth.ts) — it is not counted in the 20-table total. Every other table
// here is created by this migration and is NOT yet applied to the real
// Supabase project; RLS is a separate, later, design-then-apply pass
// (docs/rls-matrix-draft.md).

export * from "./auth";
export * from "./enums";
export * from "./profiles";
export * from "./quran";
export * from "./enrollments";
export * from "./plans";
export * from "./subscriptions";
export * from "./payments";
export * from "./billing";
export * from "./content";
export * from "./notifications";
export * from "./admin";
