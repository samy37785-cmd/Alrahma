// Independent regression tests for
// scripts/lib/rls-auto-enable-event-trigger.mjs — Stage 2I-D.
//
// Tests the semantic-identity lookup DIRECTLY against a disposable
// database (not through production-preflight-gate.mjs or any other CLI
// wrapper), covering every scenario Part B requires:
//   - the real production name (ensure_rls) is found and succeeds
//   - this project's own local-fixture name (rls_auto_enable_trigger) is
//     found and succeeds
//   - a third, arbitrary name is found and succeeds — the trigger's own
//     name genuinely does not matter when the full semantic identity is
//     present
//   - a wrong handler function fails
//   - wrong/narrowed tags fail
//   - a disabled trigger fails
//   - zero matching event triggers fails
//   - multiple ambiguous full matches fails
//   - (bonus, beyond Part B's 8) a wrong owner fails ONLY when
//     expectedOwner is explicitly requested by the caller; is silently
//     accepted (and simply reported) when the caller doesn't care —
//     this is what lets 03-surgical-reset.mjs prove "same owner
//     before/after" without hardcoding a single universal owner value
//     that would break local rehearsal tests using a different actor.
//
// Requires: TEST_DATABASE_URL pointing at a local Docker Postgres (a
// real superuser is required to CREATE EVENT TRIGGER / ALTER EVENT
// TRIGGER ... OWNER TO — same requirement as cutover-core.test.mjs's own
// disposable database, NOT the real local Supabase CLI stack, since none
// of this needs auth/storage/GoTrue).
// Usage: TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//        node test/rls-auto-enable-event-trigger.test.mjs
import pg from "pg";
import assert from "node:assert/strict";
import {
  findRlsAutoEnableEventTrigger,
  EventTriggerIdentityError,
} from "../scripts/lib/rls-auto-enable-event-trigger.mjs";
import { assertLocalHost } from "../../../lib/db/test/local-harness.mjs";

const baseConnectionString = process.env.TEST_DATABASE_URL;
if (!baseConnectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
assertLocalHost(baseConnectionString, "TEST_DATABASE_URL");

const dbName = "alrahma_event_trigger_identity_test";
const maintenanceUrl = new URL(baseConnectionString);
maintenanceUrl.pathname = "/postgres";
const testUrl = new URL(baseConnectionString);
testUrl.pathname = `/${dbName}`;

async function expectRejection(promiseFn, messagePattern, label) {
  let threw = false;
  try {
    await promiseFn();
  } catch (e) {
    threw = true;
    assert.ok(e instanceof EventTriggerIdentityError, `${label}: must throw EventTriggerIdentityError, got ${e.constructor.name}: ${e.message}`);
    assert.match(e.message, messagePattern, `${label}: message did not match; got: ${e.message}`);
  }
  assert.ok(threw, `${label}: expected a rejection, but the call succeeded`);
}

async function main() {
  console.log(`--- (re)creating dedicated test database ${dbName}`);
  const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force);`);
  await admin.query(`create database ${dbName};`);
  await admin.end();

  const client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();

  console.log("--- creating the two handler functions used across these cases");
  await client.query(`create or replace function public.rls_auto_enable() returns event_trigger language plpgsql as $f$ begin end; $f$;`);
  await client.query(`create or replace function public.some_other_function() returns event_trigger language plpgsql as $f$ begin end; $f$;`);

  const FULL_TAGS = `'CREATE TABLE','CREATE TABLE AS','SELECT INTO'`;

  // ------------------------------------------------------------------
  // T1: the real production name (ensure_rls) is found and succeeds.
  // ------------------------------------------------------------------
  console.log("--- T1: real production name 'ensure_rls' is found and succeeds");
  await client.query(`create event trigger ensure_rls on ddl_command_end when tag in (${FULL_TAGS}) execute function rls_auto_enable();`);
  const m1 = await findRlsAutoEnableEventTrigger(client);
  assert.equal(m1.evtname, "ensure_rls");
  assert.equal(m1.handler, "rls_auto_enable");
  assert.equal(m1.evtevent, "ddl_command_end");
  assert.deepEqual(m1.tags, ["CREATE TABLE", "CREATE TABLE AS", "SELECT INTO"]);
  assert.notEqual(m1.evtenabled, "D");
  await client.query(`drop event trigger ensure_rls;`);

  // ------------------------------------------------------------------
  // T2: this project's own local-fixture name (rls_auto_enable_trigger)
  // is found and succeeds — the OLD hardcoded literal must keep working,
  // this is not a hardcoded-name swap.
  // ------------------------------------------------------------------
  console.log("--- T2: local-fixture name 'rls_auto_enable_trigger' is found and succeeds");
  await client.query(`create event trigger rls_auto_enable_trigger on ddl_command_end when tag in (${FULL_TAGS}) execute function rls_auto_enable();`);
  const m2 = await findRlsAutoEnableEventTrigger(client);
  assert.equal(m2.evtname, "rls_auto_enable_trigger");
  await client.query(`drop event trigger rls_auto_enable_trigger;`);

  // ------------------------------------------------------------------
  // T3: a third, arbitrary name is found and succeeds — the trigger's
  // own name genuinely does not matter.
  // ------------------------------------------------------------------
  console.log("--- T3: an arbitrary third name is found and succeeds (name truly doesn't matter)");
  await client.query(`create event trigger totally_different_name_xyz on ddl_command_end when tag in (${FULL_TAGS}) execute function rls_auto_enable();`);
  const m3 = await findRlsAutoEnableEventTrigger(client);
  assert.equal(m3.evtname, "totally_different_name_xyz");
  await client.query(`drop event trigger totally_different_name_xyz;`);

  // ------------------------------------------------------------------
  // T4: wrong handler fails.
  // ------------------------------------------------------------------
  console.log("--- T4: wrong handler function fails");
  await client.query(`create event trigger wrong_handler_trigger on ddl_command_end when tag in (${FULL_TAGS}) execute function some_other_function();`);
  await expectRejection(
    () => findRlsAutoEnableEventTrigger(client),
    /handler is "some_other_function", expected "rls_auto_enable"/,
    "T4"
  );
  await client.query(`drop event trigger wrong_handler_trigger;`);

  // ------------------------------------------------------------------
  // T5: wrong/narrowed tags fail.
  // ------------------------------------------------------------------
  console.log("--- T5: narrowed tags fail");
  await client.query(`create event trigger narrow_tags_trigger on ddl_command_end when tag in ('CREATE TABLE') execute function rls_auto_enable();`);
  await expectRejection(
    () => findRlsAutoEnableEventTrigger(client),
    /evttags are \["CREATE TABLE"\], expected \["CREATE TABLE","CREATE TABLE AS","SELECT INTO"\]/,
    "T5"
  );
  await client.query(`drop event trigger narrow_tags_trigger;`);

  // ------------------------------------------------------------------
  // T6: a disabled trigger fails.
  // ------------------------------------------------------------------
  console.log("--- T6: a disabled trigger fails");
  await client.query(`create event trigger disabled_trigger on ddl_command_end when tag in (${FULL_TAGS}) execute function rls_auto_enable();`);
  await client.query(`alter event trigger disabled_trigger disable;`);
  await expectRejection(
    () => findRlsAutoEnableEventTrigger(client),
    /is disabled \(evtenabled="D"\)/,
    "T6"
  );
  await client.query(`drop event trigger disabled_trigger;`);

  // ------------------------------------------------------------------
  // T7: zero matching event triggers fails (nothing at all present).
  // ------------------------------------------------------------------
  console.log("--- T7: zero matches fails");
  await expectRejection(
    () => findRlsAutoEnableEventTrigger(client),
    /no event trigger found matching rls_auto_enable's expected identity at all/,
    "T7"
  );

  // ------------------------------------------------------------------
  // T8: multiple ambiguous full matches fails.
  // ------------------------------------------------------------------
  console.log("--- T8: multiple ambiguous full matches fails");
  await client.query(`create event trigger dup_one on ddl_command_end when tag in (${FULL_TAGS}) execute function rls_auto_enable();`);
  await client.query(`create event trigger dup_two on ddl_command_end when tag in (${FULL_TAGS}) execute function rls_auto_enable();`);
  await expectRejection(
    () => findRlsAutoEnableEventTrigger(client),
    /ambiguous: 2 event trigger\(s\) all match rls_auto_enable's full expected identity/,
    "T8"
  );
  await client.query(`drop event trigger dup_one;`);
  await client.query(`drop event trigger dup_two;`);

  // ------------------------------------------------------------------
  // T9 (bonus — reinforces the "owner" identity dimension Part B names):
  // a correctly-shaped trigger owned by a DIFFERENT role than requested
  // fails ONLY when expectedOwner is explicitly given; succeeds (and
  // simply reports the real owner) when the caller doesn't ask — this is
  // what lets 03-surgical-reset.mjs prove "same owner before/after"
  // without hardcoding one universal owner value that would break local
  // rehearsal tests using a different connecting actor throughout.
  // ------------------------------------------------------------------
  console.log("--- T9: owner mismatch fails only when expectedOwner is requested");
  // SUPERUSER: Postgres refuses ALTER EVENT TRIGGER ... OWNER TO a
  // non-superuser role ("the owner of an event trigger must be a
  // superuser") — found by actually running this, not by inspection.
  // Unconditional drop-then-create (not "if not exists"): roles are
  // cluster-wide, not per-database, so a role left over from an earlier
  // FAILED run of this same test (created without SUPERUSER, before this
  // fix) would otherwise silently persist across runs and never actually
  // get the SUPERUSER attribute this test now requires.
  await client.query(`drop role if exists event_trigger_test_other_owner;`);
  await client.query(`create role event_trigger_test_other_owner superuser;`);
  await client.query(`create event trigger owner_mismatch_trigger on ddl_command_end when tag in (${FULL_TAGS}) execute function rls_auto_enable();`);
  await client.query(`alter event trigger owner_mismatch_trigger owner to event_trigger_test_other_owner;`);
  const m9 = await findRlsAutoEnableEventTrigger(client); // no expectedOwner -> succeeds regardless
  assert.equal(m9.evtname, "owner_mismatch_trigger");
  assert.equal(m9.owner, "event_trigger_test_other_owner");
  await expectRejection(
    () => findRlsAutoEnableEventTrigger(client, { expectedOwner: "postgres" }),
    /owner is "event_trigger_test_other_owner", expected "postgres"/,
    "T9"
  );
  await client.query(`drop event trigger owner_mismatch_trigger;`);
  await client.query(`drop role if exists event_trigger_test_other_owner;`);

  console.log("--- cleaning up dedicated test database");
  await client.end();
  const admin2 = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin2.connect();
  await admin2.query(`drop database if exists ${dbName} with (force);`);
  await admin2.end();

  console.log("\nALL rls-auto-enable-event-trigger.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  // process.exit(1), not process.exitCode = 1: an error thrown before the
  // matching client.end() leaves an open pg connection keeping the event
  // loop alive — exitCode alone only takes effect once the loop drains
  // naturally, which it never does with a dangling connection (same fix
  // as rollback-roundtrip.test.mjs's own identical finding).
  process.exit(1);
});
