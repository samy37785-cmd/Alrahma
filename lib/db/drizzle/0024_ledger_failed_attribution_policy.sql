-- Stage 2J-B, PR #70 review round 9, item 4 -- unifies the 'failed'
-- ledger-row policy across DB uniqueness, Target->Ledger, and
-- Ledger->Target. 0022 and 0023 are left completely unmodified (this
-- engagement's own standing rule: never edit a migration once it has
-- shipped in a prior round) -- this migration only DROPs and
-- re-CREATEs 0023's own partial unique index (an index is a schema
-- OBJECT, not file content; the file 0023_ledger_integrity_constraints
-- .sql itself is untouched, byte-for-byte).
--
-- Round 8's own design deliberately excluded 'failed' rows from
-- migration_source_ledger_target_attribution_unique, reasoning that a
-- 'failed' row with a real target_id (kill-window 3: crash between the
-- target write and markReconciled(); markFailed() never clears
-- target_id) must never collide with the unique index. That reasoning
-- was incomplete: it correctly protects a row transitioning through its
-- OWN failed -> created -> reconciled lifecycle (always the SAME
-- ledger row, UPDATEd in place -- migration_source_ledger_source_
-- target_unique, from 0022, already guarantees at most one ledger row
-- per (source_system, source_database, source_collection,
-- source_document_id, target_table), so a resume/retry of the SAME
-- source document can never produce a second row to collide with in
-- the first place) -- but it left a real gap: NOTHING prevented two
-- DIFFERENT source documents from each ending up with a 'failed' row
-- attributing the SAME target_id to themselves. A 'failed' + target_id
-- row is a provisional attribution (kill-window 3 proves the row it
-- names is real), not a null claim -- letting two different sources
-- both provisionally claim the same real row is exactly the same class
-- of corruption 0023 closed for created/reconciled (which source
-- document actually produced this row?), just one status value short
-- of complete.
--
-- 'failed' rows with target_id IS NULL remain completely unaffected --
-- 0023's CHECK constraint (migration_source_ledger_created_reconciled_
-- requires_target) only ever required a non-null target_id for
-- 'created'/'reconciled'; a 'failed' row that never reached a target
-- write correctly still has, and keeps, target_id = NULL. This
-- migration changes ONLY which (target_table, target_id) pairs may be
-- claimed by more than one row while attributable in ANY of created/
-- reconciled/failed -- it does not touch the CHECK constraint at all.
--
-- production-import-orchestrator.mjs's verifyLedgerPointsToRealTargets()
-- (Ledger -> Target) and its composite-table counterpart
-- (countGhostLedgerComposite()) are updated in the SAME commit to also
-- check 'failed' rows with a target_id, matching this same unified
-- policy: a 'failed' row's target_id, if set, must still point at a
-- real row -- if that row has since gone missing, that dangling
-- provisional attribution is now surfaced by preflight instead of
-- being silently invisible forever.

DROP INDEX "migration_source_ledger_target_attribution_unique";--> statement-breakpoint

CREATE UNIQUE INDEX "migration_source_ledger_target_attribution_unique"
  ON "migration_source_ledger" ("target_table", "target_id")
  WHERE "target_id" IS NOT NULL AND "status" IN ('created', 'reconciled', 'failed');
--> statement-breakpoint
