-- Stage 2J-B — schema support for a lossless, offline-rehearsed Mongo ->
-- Supabase migration. Append-only: does not edit any statement in
-- 0000-0021. Every change here is additive (new nullable column, new
-- table, or a CREATE OR REPLACE of an existing function with an
-- unchanged signature) so it is safe to apply to a database that is
-- already running 0000-0021 unmodified.
--
-- NOT applied to Supabase Production in this stage — offline/local
-- rehearsal only (see ops/option-a-rehearsal and Stage 2J-B's own final
-- report for what was actually run and where).
--
-- Five things, in order:
--   1. payments: allow a genuinely unlinked ("guest") charge to exist
--      without a fake profiles row, and fix the one trigger whose
--      equality check silently assumed user_id could never be NULL.
--   2. payments: a real column for the checkout/order identifier,
--      distinct from the existing gateway_payment_id (which is, and
--      remains, the settled charge/capture identifier) — the two must
--      never be conflated (Stage 2J-B Part D.3).
--   3. A durable, DB-side migration-source ledger — the real idempotency/
--      provenance guarantee this migration tooling relies on, NOT a
--      local .checkpoints file (Stage 2J-B Part D.2).
--   4. A locked-down table for the original gateway payload each
--      migrated payment carried in Mongo (`payments.raw` in the old
--      model) — payments.gateway_metadata is a small, allowlisted set of
--      fields by design (see payments.ts's own doc comment) and is not
--      where a full historical payload belongs.
--   5. Quran progress: the old Mongo models tracked goal TYPE (not just
--      target), a LONGEST streak (not just current), and a last-activity
--      date — none of which quran_reading_progress/
--      quran_memorization_stats had a column for. Additive columns only;
--      the existing goal/streak columns keep their exact current meaning
--      (current streak / goal target).
--
-- Every new table is service_role-only (RLS enabled AND no anon/
-- authenticated grant at all) — this is migration tooling's own
-- bookkeeping, never end-user- or even admin-UI-facing data.

-- =======================================================================
-- 1. payments.user_id -> nullable (a real "no linked account" charge,
--    never a fabricated profiles row).
-- =======================================================================

ALTER TABLE "payments" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

-- payments_select_own_or_admin_aal2 (0002_rls.sql) is `user_id =
-- auth.uid() OR is_admin_aal2()` — with user_id NULL, `NULL = auth.uid()`
-- is NULL (never TRUE) for every real authenticated user, so a guest
-- payment is automatically invisible to anon/authenticated and visible
-- only to an AAL2 admin. No RLS policy text change needed; re-verified
-- explicitly in Stage 2J-B Part I's security tests, not just asserted
-- here.

-- validate_refund_insert()'s CURRENT version (0009_refund_integrity.sql
-- — NOT 0001's original; 0009 added the amount_minor > 0 guard 0001
-- never had, and this CREATE OR REPLACE must be built on top of that
-- latest version or it silently reverts that fix). Round of self-review
-- caught exactly this: a first draft of this migration was based on
-- 0001's body, which would have reintroduced the zero/negative-refund
-- bug 0009 closed — found by lib/db/test/rls.local.test.mjs's own
-- "validate_refund_insert() itself rejects a zero amount" assertion
-- actually failing against a fresh migrate() run, not by re-inspection.
--
-- The one real change from 0009's version: `new.user_id <> parent.
-- user_id` — plain `<>` against NULL evaluates to NULL, which PL/pgSQL's
-- `IF` treats as false, i.e. the check SILENTLY never fires when either
-- side is NULL. That was harmless while user_id was NOT NULL (never
-- actually NULL) but becomes a real integrity hole the moment guest
-- charges exist: a refund could be inserted with a mismatched real
-- user_id against a NULL-user_id parent charge (or vice versa) and this
-- check would wrongly let it through. Fixed here with a null-safe
-- `IS DISTINCT FROM` — same signature, same trigger binding (triggers
-- reference a function by name, not a frozen body), so
-- `payments_validate_refund_insert` picks this up with no other change.
-- Every other check is 0009's, unchanged, re-verified by the full
-- rls.local.test.mjs refund suite passing against this exact function
-- body, not assumed carried forward.
CREATE OR REPLACE FUNCTION "public"."validate_refund_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
declare
  parent public.payments%rowtype;
  already_refunded integer;
begin
  if new.kind <> 'refund' then
    return new;
  end if;

  if new.amount_minor is null or new.amount_minor <= 0 then
    raise exception 'refund amount_minor must be greater than zero (got %)', new.amount_minor;
  end if;

  select * into parent
  from public.payments
  where id = new.parent_payment_id
  for update;

  if not found then
    raise exception 'payments.parent_payment_id % does not reference an existing payments row', new.parent_payment_id;
  end if;

  if parent.kind <> 'charge' then
    raise exception 'payments row % cannot refund another refund (parent_payment_id=% has kind=%)', new.id, new.parent_payment_id, parent.kind;
  end if;

  if parent.status <> 'succeeded' then
    raise exception 'payments row % cannot refund a charge that has not succeeded (parent_payment_id=% has status=%)', new.id, new.parent_payment_id, parent.status;
  end if;

  if new.user_id is distinct from parent.user_id then
    raise exception 'refund user_id (%) does not match its parent charge''s user_id (%)', new.user_id, parent.user_id;
  end if;

  if new.currency_snapshot <> parent.currency_snapshot then
    raise exception 'refund currency_snapshot (%) does not match its parent charge''s currency_snapshot (%)', new.currency_snapshot, parent.currency_snapshot;
  end if;

  if new.gateway <> parent.gateway then
    raise exception 'refund gateway (%) does not match its parent charge''s gateway (%)', new.gateway, parent.gateway;
  end if;

  select coalesce(sum(amount_minor), 0) into already_refunded
  from public.payments
  where parent_payment_id = parent.id
    and kind = 'refund'
    and status in ('succeeded', 'pending');

  if already_refunded + new.amount_minor > parent.amount_minor then
    raise exception 'refund of % would exceed the refundable balance on payments row % (already refunded %, charge amount %)',
      new.amount_minor, parent.id, already_refunded, parent.amount_minor;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

-- =======================================================================
-- 2. payments: customer snapshot + a real, separate order-id column.
--
--    Old Mongo Payment.customer{name,email,phone} has no home on
--    `payments` at all (only `invoices` snapshots a customer name).
--    Without it, a guest (user_id IS NULL) charge would be
--    unidentifiable after migration — nothing to reconcile it against.
--    Nullable text, same "snapshot at write time" discipline already
--    used for amount/currency/plan on this exact table.
--
--    gateway_order_id is the checkout-session/order identifier (Stripe
--    Checkout Session id / PayPal order id); the pre-existing
--    gateway_payment_id remains the settled charge/capture identifier
--    (Stripe payment_intent / PayPal capture id) — see payments.ts's own
--    doc comment for that column's original meaning. The two were never
--    interchangeable and must not be written into the same column.
-- =======================================================================

ALTER TABLE "payments" ADD COLUMN "customer_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "customer_email_snapshot" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "customer_phone_snapshot" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_order_id" text;--> statement-breakpoint
CREATE INDEX "payments_gateway_order_id_idx" ON "payments" ("gateway_order_id") WHERE "gateway_order_id" IS NOT NULL;--> statement-breakpoint

-- =======================================================================
-- 3. migration_source_ledger — the real, DB-side idempotency/provenance
--    guarantee (Stage 2J-B Part D.2). A local .checkpoints/*.json file
--    (the existing tooling's only guard) is lost the moment someone runs
--    the import from a different machine, or the file is deleted — this
--    table is the guard that survives both. One row per (source
--    document, target table): a second import attempt for the same
--    source document into the same target table is rejected by the
--    unique index below, not merely skipped by convention.
-- =======================================================================

CREATE TABLE "migration_source_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_system" text NOT NULL,
  "source_database" text NOT NULL,
  "source_collection" text NOT NULL,
  "source_document_id" text NOT NULL,
  "source_content_hash" text NOT NULL,
  "target_table" text NOT NULL,
  "target_id" text,
  "status" text NOT NULL DEFAULT 'planned',
  "error_reason" text,
  "planned_at" timestamp with time zone NOT NULL DEFAULT now(),
  "migrated_at" timestamp with time zone,
  CONSTRAINT "migration_source_ledger_status_allowlist"
    CHECK ("status" IN ('planned', 'created', 'reconciled', 'failed'))
);
--> statement-breakpoint

-- The real duplicate-import guard: this exact source document, imported
-- into this exact target table, at most once — regardless of which
-- machine or which run performed it.
CREATE UNIQUE INDEX "migration_source_ledger_source_target_unique"
  ON "migration_source_ledger"
  ("source_system", "source_database", "source_collection", "source_document_id", "target_table");--> statement-breakpoint

CREATE INDEX "migration_source_ledger_target_idx"
  ON "migration_source_ledger" ("target_table", "target_id");--> statement-breakpoint

ALTER TABLE "migration_source_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "migration_source_ledger" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT ALL ON "migration_source_ledger" TO service_role;--> statement-breakpoint

-- =======================================================================
-- 4. payment_source_snapshots — the locked-down home for a migrated
--    payment's original raw gateway payload (old Mongo Payment.raw).
--    Never exposed to the owning user or to anon/authenticated at all —
--    payments.gateway_metadata stays the small, explicitly allowlisted
--    surface it was designed as (payment-method brand, masked last4,
--    receipt URL); a full historical payload does not belong there.
-- =======================================================================

CREATE TABLE "payment_source_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" uuid NOT NULL REFERENCES "public"."payments"("id") ON DELETE RESTRICT,
  "source_system" text NOT NULL,
  "source_collection" text NOT NULL,
  "source_document_id" text NOT NULL,
  "raw_payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "payment_source_snapshots_payment_id_unique"
  ON "payment_source_snapshots" ("payment_id");--> statement-breakpoint

ALTER TABLE "payment_source_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "payment_source_snapshots" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT ALL ON "payment_source_snapshots" TO service_role;--> statement-breakpoint

-- =======================================================================
-- 5. Quran progress: goal TYPE, LONGEST streak, last-activity date.
--    Additive only — the existing `goal`/`streak` columns keep their
--    exact current meaning (goal target / current streak).
-- =======================================================================

ALTER TABLE "quran_reading_progress" ADD COLUMN "goal_type" text;--> statement-breakpoint
ALTER TABLE "quran_reading_progress" ADD CONSTRAINT "quran_reading_progress_goal_type_allowlist"
  CHECK ("goal_type" IS NULL OR "goal_type" IN ('verses', 'minutes', 'pages'));--> statement-breakpoint
ALTER TABLE "quran_reading_progress" ADD COLUMN "longest_streak" integer NOT NULL DEFAULT 0;--> statement-breakpoint
-- Kept as the exact 'YYYY-MM-DD' text the old model stored (QuranReadingProgress.js
-- streak.lastReadDate) rather than a real `date` column — no parsing/
-- timezone reinterpretation of a value this migration cannot verify the
-- original meaning of beyond its own literal text.
ALTER TABLE "quran_reading_progress" ADD COLUMN "last_read_date" text;--> statement-breakpoint

ALTER TABLE "quran_memorization_stats" ADD COLUMN "goal_type" text;--> statement-breakpoint
ALTER TABLE "quran_memorization_stats" ADD CONSTRAINT "quran_memorization_stats_goal_type_allowlist"
  CHECK ("goal_type" IS NULL OR "goal_type" IN ('verses', 'minutes'));--> statement-breakpoint
ALTER TABLE "quran_memorization_stats" ADD COLUMN "longest_streak" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quran_memorization_stats" ADD COLUMN "last_practice_date" text;--> statement-breakpoint
