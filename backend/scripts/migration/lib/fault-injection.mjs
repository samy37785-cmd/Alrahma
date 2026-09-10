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
]);

export function throwIfFaultStage(stage) {
  const target = process.env.MIGRATION_FAULT_INJECT_STAGE;
  if (!target || target !== stage) return;
  if (process.env.MIGRATION_FAULT_INJECT_ONCE && FIRED.has(stage)) return;
  FIRED.add(stage);
  throw new Error(`[fault-injection] deliberate failure at stage "${stage}" (MIGRATION_FAULT_INJECT_STAGE)`);
}
