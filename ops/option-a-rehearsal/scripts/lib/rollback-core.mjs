// The Rollback critical section — shared by the production rollback
// orchestrator and by local tests, mirroring cutover-core.mjs's
// "one shared implementation, not two copies" discipline.
//
// Corrective-review fixes (Stage 2D, items 4-5):
//   - The target is now verified to be EXACTLY the expected NEW
//     (post-cutover) schema BEFORE anything is touched — not merely
//     "no table outside the bundle's inventory", which --allow-nonempty
//     could previously bypass entirely. --allow-nonempty is GONE: there
//     is no flag anywhere in this file or its caller that widens this
//     check. A target that isn't exactly the expected new schema must
//     be resolved by a human, not forced through.
//   - inverse-reset-new-schema.sql is applied (and independently
//     verified gone) BEFORE pg_restore ever runs, restoring the
//     original documented order.
//   - The "restore auth.users trigger + event triggers" step
//     (previously a bare loop of unwrapped `client.query(stmt)` calls,
//     each auto-committing on its own) is now wrapped in its own
//     explicit BEGIN/COMMIT — a failure between the two statements
//     used to leave one applied and one not, silently, with no
//     transactional undo.
//
// Stage 2D "Rollback Privilege + Strict TLS Final Corrective": the
// read-only production audit proved the real connecting role (postgres)
// is not a member of supabase_admin and cannot SET ROLE into it, so a
// real rollback would have aborted mid-restore on the bundle's
// supabase_admin-owned DEFAULT ACL entries. pg-restore-runner.mjs's
// filterRestoreToc now excludes those entries from every restore;
// verifyDefaultAclUnchanged (below) is the live proof that skipping
// them left pg_default_acl exactly as it was, not merely that
// pg_restore stopped erroring.
//
// Full-operation atomicity (one Postgres transaction spanning inverse-
// reset + pg_restore + trigger-restore) is NOT implemented here, and
// item 3's "if atomic execution is impossible, stop and explain"
// applies to CUTOVER, not this file — but the same honesty standard is
// applied: pg_restore is an external subprocess with its OWN
// connection and its OWN `--single-transaction` boundary, so it cannot
// share a single Postgres transaction with this file's own client.
// Instead, THREE separate, independently-safe boundaries are used:
//   1. inverse-reset-new-schema.sql — self-contained begin/commit; a
//      failure here leaves the new schema untouched (nothing removed).
//   2. pg_restore --single-transaction — a failure here leaves the
//      target in the post-inverse-reset state (new schema already
//      gone, old schema not yet restored) — an empty-of-named-objects
//      public schema, not a half-restored one; pg_restore's own
//      transaction guarantees that.
//   3. the trigger-restore statements — now atomic with each other.
// Each boundary's failure is loud (thrown, not swallowed) and leaves a
// state the final post-restore verification step can precisely
// describe — never a silent partial state. See
// test/rollback-core.test.mjs's failure-injection cases for proof.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EXPECTED_NEW_TABLES } from "./new-schema-fingerprint.mjs";
import { parsePgTextArray } from "./pg-array.mjs";
import { snapshotDefaultAcl, verifyDefaultAclUnchanged } from "./default-acl.mjs";

export { snapshotDefaultAcl, verifyDefaultAclUnchanged };

export class InjectedFailure extends Error {}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// Bundle checksum + freshness + provenance verification — previously
// only checksums were checked here (freshness/sourceMode/projectRef
// were checked for CUTOVER's backup bundle by production-preflight-
// gate.mjs, but never for the bundle a ROLLBACK restores). Item 5 asks
// for this rigor "directly under the same lock and before first
// change" for both tools, not preflight-only.
export function verifyBundleChecksumsAndFreshness(bundleDir, { expectedProjectRef, expectedSourceMode = "production", maxAgeHours = 1 }) {
  const manifestPath = path.join(bundleDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`bundle manifest.json not found in "${bundleDir}"`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error(`bundle manifest.json has no files[]`);
  for (const f of manifest.files) {
    const p = path.join(bundleDir, f.name);
    if (!fs.existsSync(p)) throw new Error(`bundle names "${f.name}" which does not exist`);
    const actual = sha256File(p);
    if (actual !== f.sha256) throw new Error(`bundle file "${f.name}" sha256 mismatch: manifest says ${f.sha256}, actual ${actual}`);
  }
  if (manifest.sourceMode !== expectedSourceMode) {
    throw new Error(`bundle manifest.sourceMode is "${manifest.sourceMode}", expected "${expectedSourceMode}" — refusing to restore a bundle whose own manifest doesn't declare the expected provenance.`);
  }
  if (manifest.projectRef !== expectedProjectRef) {
    throw new Error(`bundle manifest.projectRef "${manifest.projectRef}" != expected "${expectedProjectRef}" — refusing to restore a bundle taken from a different project.`);
  }
  const generatedAt = new Date(manifest.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) throw new Error(`bundle manifest.generatedAt is not a valid date: "${manifest.generatedAt}"`);
  const ageHours = (Date.now() - generatedAt.getTime()) / 3_600_000;
  if (ageHours > maxAgeHours) {
    throw new Error(`bundle is ${ageHours.toFixed(2)}h old (generatedAt=${manifest.generatedAt}), exceeds the ${maxAgeHours}h freshness requirement.`);
  }
  const inventoryPath = path.join(bundleDir, "inventory.json");
  if (!fs.existsSync(inventoryPath)) throw new Error(`bundle inventory.json not found — cannot post-verify a restore without it`);
  return { manifest, inventory: JSON.parse(fs.readFileSync(inventoryPath, "utf8")) };
}

// snapshotDefaultAcl / verifyDefaultAclUnchanged now live in
// default-acl.mjs (shared with cutover-core.mjs) — re-exported above
// for every existing importer of this file. The live-evidence proof
// they give here is that filterRestoreToc's exclusion of the
// supabase_admin-owned DEFAULT ACL TOC entries (pg-restore-runner.mjs)
// actually worked, not merely that pg_restore didn't error.

// Target must be EXACTLY the expected new (post-cutover) schema — no
// bypass flag. Called directly under the shared advisory lock, before
// anything is touched.
export async function verifyTargetIsExpectedNewSchema(client) {
  const { rows: tableRows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
  const actualTables = tableRows.map((r) => r.tablename);
  const unexpected = actualTables.filter((t) => !EXPECTED_NEW_TABLES.includes(t));
  const missing = EXPECTED_NEW_TABLES.filter((t) => !actualTables.includes(t));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `target public schema is not exactly the expected NEW (post-cutover) schema — refusing to roll back.\n` +
      `  unexpected table(s) present: ${unexpected.join(", ") || "(none)"}\n` +
      `  expected table(s) missing:   ${missing.join(", ") || "(none)"}\n` +
      `There is no bypass flag for this check. A target that doesn't match must be investigated and resolved manually before any rollback is attempted.`
    );
  }
}

// Post-restore verification against the bundle's own inventory.json —
// tables, row counts, RLS state, full policy definitions, functions,
// enums, auth trigger, event triggers. Same checks restore-bundle.mjs
// already performs (proven against the real production bundle earlier
// in this engagement); reproduced here as an importable, independently
// testable function rather than only living inline in the orchestrator.
export async function verifyRestoredInventory(client, inventory) {
  const failures = [];
  const vfail = (msg) => failures.push(msg);

  const { rows: tableRows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
  const actualTables = tableRows.map((r) => r.tablename).sort();
  const expectedTables = [...inventory.tables].sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
    vfail(`table list differs from inventory.json: got ${JSON.stringify(actualTables)}, expected ${JSON.stringify(expectedTables)}`);
  }

  for (const table of inventory.tables) {
    const { rows } = await client.query(`select count(*) as c from public."${table.replace(/"/g, '""')}";`);
    const actual = Number(rows[0].c);
    const expected = inventory.rowCounts[table];
    if (actual !== expected) vfail(`public.${table} has ${actual} row(s) after restore, expected ${expected}`);
  }

  if (inventory.rlsState) {
    for (const table of inventory.tables) {
      const { rows } = await client.query(
        `select relrowsecurity, relforcerowsecurity from pg_class where oid = format('public.%I', $1::text)::regclass;`,
        [table]
      );
      const expected = inventory.rlsState[table];
      const actual = { enabled: rows[0]?.relrowsecurity ?? null, forced: rows[0]?.relforcerowsecurity ?? null };
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        vfail(`public.${table} RLS state after restore is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
      }
    }
  }

  if (Array.isArray(inventory.policies)) {
    const { rows: restoredPolicies } = await client.query(`
      select tablename, policyname, cmd, roles, qual, with_check
      from pg_policies where schemaname='public' order by tablename, policyname;
    `);
    const normalize = (rows) => rows.map((r) => ({ ...r, roles: parsePgTextArray(r.roles || []).sort() }));
    if (JSON.stringify(normalize(restoredPolicies)) !== JSON.stringify(normalize(inventory.policies))) {
      vfail(`restored policy set differs from inventory.json (full definitions) — restored ${restoredPolicies.length}, expected ${inventory.policies.length}`);
    }
  }

  const { rows: restoredFuncs } = await client.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by proname;`);
  const restoredFuncNames = restoredFuncs.map((r) => r.proname).sort();
  const expectedFuncNames = [...inventory.functions].sort();
  if (JSON.stringify(restoredFuncNames) !== JSON.stringify(expectedFuncNames)) {
    vfail(`function list differs from inventory.json: got ${JSON.stringify(restoredFuncNames)}, expected ${JSON.stringify(expectedFuncNames)}`);
  }

  const { rows: restoredEnums } = await client.query(`
    select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' group by t.typname order by t.typname;
  `);
  const restoredEnumsNorm = JSON.stringify(restoredEnums.map((r) => ({ name: r.typname, labels: r.labels })));
  const expectedEnumsNorm = JSON.stringify([...inventory.enums].sort((a, b) => a.name.localeCompare(b.name)));
  if (restoredEnumsNorm !== expectedEnumsNorm) {
    vfail(`enum set differs from inventory.json: got ${restoredEnumsNorm}, expected ${expectedEnumsNorm}`);
  }

  const { rows: restoredAuthTrigs } = await client.query(`select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by tgname;`);
  const restoredAuthTrigNames = restoredAuthTrigs.map((r) => r.tgname).sort();
  const expectedAuthTrigNames = [...inventory.authUsersTriggers].sort();
  if (JSON.stringify(restoredAuthTrigNames) !== JSON.stringify(expectedAuthTrigNames)) {
    vfail(`auth.users trigger list differs from inventory.json: got ${JSON.stringify(restoredAuthTrigNames)}, expected ${JSON.stringify(expectedAuthTrigNames)}`);
  }

  const { rows: restoredEventTrigs } = await client.query(`select evtname from pg_event_trigger order by evtname;`);
  const restoredEventTrigNames = restoredEventTrigs.map((r) => r.evtname).sort();
  const expectedEventTrigNames = [...inventory.eventTriggers].sort();
  const missingEventTrigs = expectedEventTrigNames.filter((n) => !restoredEventTrigNames.includes(n));
  if (missingEventTrigs.length > 0) {
    vfail(`event trigger(s) recorded in inventory.json are missing after restore: ${missingEventTrigs.join(", ")} (present: ${restoredEventTrigNames.join(", ")})`);
  }

  if (failures.length > 0) {
    throw new Error(`post-restore verification failed:\n  - ${failures.join("\n  - ")}`);
  }
}

// injectFailureAt (undefined = no injection; used only by tests — see
// test/rollback-core.test.mjs):
//   "after-target-check"     throw right after confirming the target is
//                            the expected new schema, before touching
//                            anything.
//   "after-inverse-reset"    throw right after inverse-reset-new-
//                            schema.sql is applied and verified gone.
//   "after-pg-restore"       throw right after restoreFn() returns.
//   "during-trigger-restore" throw inside the trigger-restore
//                            transaction, before its COMMIT.
export async function runRollbackOnClient(client, {
  inverseResetSql,
  restoreFn,
  runTriggerStatements,
  inventory,
  injectFailureAt,
  log = () => {},
}) {
  log("=== snapshotting pg_default_acl (must be byte-for-byte unchanged by this rollback) ===");
  const defaultAclBefore = await snapshotDefaultAcl(client);
  log(`OK    ${defaultAclBefore.length} pg_default_acl row(s) captured as the baseline`);

  log("=== target verification: must be exactly the expected NEW (post-cutover) schema ===");
  await verifyTargetIsExpectedNewSchema(client);
  log("OK    target schema matches exactly — safe to remove and restore over");

  if (injectFailureAt === "after-target-check") throw new InjectedFailure("TEST: injected failure right after target verification, before anything is touched");

  log("=== inverse-reset-new-schema.sql (removes the NEW schema + migration journal, own transaction) ===");
  await client.query(inverseResetSql);
  const { rows: leftoverNew } = await client.query(`select tablename from pg_tables where schemaname='public' and tablename = any($1::text[]);`, [EXPECTED_NEW_TABLES]);
  const { rows: drizzleSchemaRows } = await client.query(`select 1 from pg_namespace where nspname='drizzle';`);
  if (leftoverNew.length > 0 || drizzleSchemaRows.length > 0) {
    throw new Error(`inverse reset did not fully remove the new schema: leftover table(s) ${leftoverNew.map((r) => r.tablename).join(", ") || "(none)"}, drizzle schema present: ${drizzleSchemaRows.length > 0}`);
  }
  log("OK    new schema + migration journal are gone");

  if (injectFailureAt === "after-inverse-reset") throw new InjectedFailure("TEST: injected failure right after inverse reset, before pg_restore");

  log("=== pg_restore (external subprocess, --single-transaction — its own atomicity boundary) ===");
  await restoreFn();
  log("OK    public_schema.dump restored");

  if (injectFailureAt === "after-pg-restore") throw new InjectedFailure("TEST: injected failure right after pg_restore, before trigger restore");

  log("=== restoring auth.users trigger + event triggers (own explicit transaction — fixes the prior per-statement auto-commit bug) ===");
  await client.query("BEGIN");
  try {
    await runTriggerStatements(client);
    if (injectFailureAt === "during-trigger-restore") throw new InjectedFailure("TEST: injected failure inside the trigger-restore transaction, before its COMMIT");
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection may already be broken; nothing more to undo either way
    }
    throw e;
  }
  log("OK    auth trigger + event triggers restored atomically");

  log("=== post-restore verification against the bundle's inventory.json ===");
  await verifyRestoredInventory(client, inventory);
  log("OK    post-restore verification passed — structure, data, RLS, policies, functions, triggers, enums all match the bundle.");

  log("=== verifying pg_default_acl was not touched by this rollback ===");
  await verifyDefaultAclUnchanged(client, defaultAclBefore);
  log("OK    pg_default_acl unchanged — the filtered restore never touched default-privilege registrations.");
}
