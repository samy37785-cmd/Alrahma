-- Stage 2J-B, PR #70 review round 8, item 6 -- DB-level bidirectional
-- ledger integrity constraints for migration_source_ledger (created by
-- 0022, left completely unmodified here). A NEW migration rather than
-- editing 0022: this engagement's own standing constraint is "never edit
-- 0000-0021; migration 0022 stays append-only" -- every statement below
-- is a pure ADD CONSTRAINT/CREATE INDEX against the EXISTING table, no
-- column, table, or statement from 0022 is altered, reordered, or
-- dropped.
--
-- Two real invariants the application code has always relied on but
-- nothing at the DB level actually enforced until now:
--
--   1. A 'created' or 'reconciled' ledger row always claims a real
--      target -- target_id NULL together with either status is a
--      structurally invalid state. The application code never
--      intentionally produces it (markCreated()/markReconciled() always
--      set/require target_id), but nothing at the DB level prevented a
--      future bug from doing so; this makes that state impossible to
--      persist at all, not merely unexpected.
--
--   2. At most ONE ledger row may claim a given (target_table,
--      target_id) while 'created'/'reconciled'. Two different source
--      documents both attributed to the SAME live target row is a real
--      corruption of the ledger's entire meaning (which source document
--      actually produced this row?) -- not just a harmless duplicate.
--      This is exactly the DB-level backstop for what
--      production-import-orchestrator.mjs's verifyLedgerPointsToRealTargets()/
--      verifyTeacherLinkProvenance() already check at the application
--      level; the unique index below makes the violation structurally
--      impossible to write in the first place, race conditions included.
--
-- A 'failed' row is deliberately EXCLUDED from both constraints, by
-- explicit, tested policy (unrecorded-data-preflight.test.mjs,
-- "round 8, item 6: explicit, tested policy for 'failed' rows"):
-- markFailed() never clears target_id -- a
-- crash between the target write and reconciliation (kill-window 3,
-- documented since review round 3) legitimately leaves a 'failed' row
-- with a real, live target_id set, and that row is NOT considered to
-- "own" that target the way a 'created'/'reconciled' row does -- resume/
-- rollback tooling is what resolves it, not a DB constraint.

ALTER TABLE "migration_source_ledger"
  ADD CONSTRAINT "migration_source_ledger_created_reconciled_requires_target"
  CHECK ("status" NOT IN ('created', 'reconciled') OR "target_id" IS NOT NULL);
--> statement-breakpoint

CREATE UNIQUE INDEX "migration_source_ledger_target_attribution_unique"
  ON "migration_source_ledger" ("target_table", "target_id")
  WHERE "target_id" IS NOT NULL AND "status" IN ('created', 'reconciled');
--> statement-breakpoint
