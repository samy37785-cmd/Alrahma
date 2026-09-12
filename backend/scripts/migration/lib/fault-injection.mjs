// Stage 2J-B Part G/H — deterministic failure injection for the migration
// tooling's own tests. NEVER active unless the operator explicitly sets
// MIGRATION_FAULT_INJECT_STAGE, so this has zero effect on any real run
// (local rehearsal or, later, an actually-authorized production run).
//
// Usage inside a worker script, at the exact point Stage 2J-B Part H names
// (e.g. right after a GoTrue account is created but before its profile/RBAC
// row is written):
//
//   import { throwIfFaultStage } from './lib/fault-injection.mjs';
//   ...
//   throwIfFaultStage('after_auth_user_before_profile');
//
// A rehearsal/test run sets MIGRATION_FAULT_INJECT_STAGE=after_auth_user_before_profile
// (and, to fire only once instead of on every iteration, optionally
// MIGRATION_FAULT_INJECT_ONCE=1) to prove resume-after-interruption actually
// works at that specific point, not just "somewhere".
const FIRED = new Set();

export const FAULT_STAGES = Object.freeze([
  'during_user_creation',
  'after_auth_user_before_profile',
  'during_subscriptions',
  'during_payments',
  'during_relationships',
  'during_quran_import',
  // Stage 2J-B Part H, review round 2 -- ledger-resume and rollback-
  // atomicity kill-window tests (mongo-to-supabase.mjs):
  'after_ledger_planned_before_target_write',
  'after_target_write_before_marked_created',
  'after_marked_created_before_reconciled',
  'during_rollback_before_ledger_delete',
  // PR #70 review round 7, item 2 -- GoTrue account creation succeeded
  // (a real HTTP 200 from the admin API) but the process crashes before
  // markCreated() ever runs. On resume, migrateOneUser()/migrateOneAdmin()
  // must find the real auth.users row by email and link it to the SAME
  // already-`planned` ledger row -- never attempt a second createUser()
  // call, never leave the ledger permanently orphaned from a target that
  // genuinely exists.
  'after_gotrue_create_before_marked_created',
  // Round 7, item 3 -- subscriptions.INSERT and markCreated() are now one
  // real transaction; this fires INSIDE it, after the INSERT, before
  // markCreated(). The kill-window test proves the whole transaction rolls
  // back -- the row must NOT exist afterward, not just "not yet ledgered".
  'after_subscription_insert_before_marked_created',
  // Round 7, item 6 -- profiles.teacher_id / parent_student_links write
  // and markCreated() are now one real transaction per relationship link,
  // mirroring the same pattern.
  'after_relationship_write_before_marked_created',
  // Round 7, item 7 -- ensureMigrationSeedAdmin() now writes auth.users +
  // profiles + admin_role_assignments inside ONE transaction; one stage
  // per statement so a test can prove a crash after ANY of the three
  // leaves the whole identity rolled back, never a partial seed admin.
  'after_seed_admin_auth_user_insert',
  'after_seed_admin_profile_insert',
  'after_seed_admin_role_assignment_insert',
]);

export function throwIfFaultStage(stage) {
  const target = process.env.MIGRATION_FAULT_INJECT_STAGE;
  if (!target || target !== stage) return;
  if (process.env.MIGRATION_FAULT_INJECT_ONCE && FIRED.has(stage)) return;
  FIRED.add(stage);
  throw new Error(`[fault-injection] deliberate failure at stage "${stage}" (MIGRATION_FAULT_INJECT_STAGE)`);
}
