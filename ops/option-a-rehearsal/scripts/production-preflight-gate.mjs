#!/usr/bin/env node
// Option A production preflight gate — CHECK PHASE ONLY.
//
// ============================================================================
// THIS SCRIPT NEVER CONNECTS TO ANYTHING BY DEFAULT AND WAS NEVER RUN
// AGAINST THE REAL SUPABASE PROJECT DURING THIS TASK. It was tested only
// against the disposable local rehearsal stack (ops/option-a-rehearsal),
// by pointing --database-url at 127.0.0.1:54322. Running it against the
// real project is a deliberate, separate, human decision — this file
// existing does not authorize that, and no other script or CI job calls
// this file automatically.
// ============================================================================
//
// This is the CHECK phase only. It performs exclusively read-only
// SELECT/catalog queries. It NEVER runs DROP/CREATE/ALTER/INSERT/UPDATE/
// DELETE. A passing result does NOT apply anything and does NOT chain
// into any apply step — printed explicitly at the end. The actual DROP
// SCHEMA / migrate() sequence is a SEPARATE, human-run set of commands
// that a real operator decides to run only after reading this script's
// PASS output AND getting the separate go-ahead this whole engagement's
// standing constraints require.
//
// Usage (every flag required — there are no defaults that reach a real
// database):
//   node production-preflight-gate.mjs \
//     --database-url <postgres connection string> \
//     --project-ref difzynyphojgisrfvrkd \
//     --confirm-token "I-UNDERSTAND-THIS-WILL-DROP-PRODUCTION-difzynyphojgisrfvrkd" \
//     --dump-file <path> --checksum-file <path> --max-dump-age-hours 24 \
//     --expected-branch <branch> --expected-sha <sha>
//
// Exit code 0 only if every check below passes. Exit code 1 on the
// first failure, or if any required flag is missing (missing flags are
// themselves a failure, never a default-through).

import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import pg from "pg";

const EXPECTED_PROJECT_REF = "difzynyphojgisrfvrkd";

// The approved inventory this gate checks the live database against —
// copied from docs/remote-supabase-inventory.md / docs/option-a-*.md at
// the time this script was authored. If the real, approved design
// changes, this list must be updated in the SAME reviewed change — it
// is a tripwire, not a lock (same discipline as
// lib/db/test/published-migrations-checksum.test.mjs).
const APPROVED_PUBLIC_FUNCTIONS = new Set([
  // The real remote project's CURRENT (pre-Option-A) function inventory,
  // per docs/remote-supabase-inventory.md §F, captured 2026-08-30. This
  // gate is meant to run BEFORE Option A touches anything — so "approved"
  // here means "matches what is already, currently there," not the new
  // design's functions (those don't exist until migrate() runs, which is
  // the separate apply step this gate never performs). If the real
  // project's state changes before this gate is actually used, this list
  // must be re-verified against a fresh docs/remote-supabase-inventory.md
  // pass in the SAME reviewed change, not assumed still accurate.
  "handle_new_user",
  "rls_auto_enable",
]);
const EXPECTED_MIGRATION_COUNT = 11;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

function fail(msg) {
  console.log(`FAIL  ${msg}`);
  process.exitCode = 1;
}
function pass(msg) {
  console.log(`PASS  ${msg}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let ok = true;
  const require_ = (name) => {
    if (!args[name]) {
      fail(`missing required --${name}`);
      ok = false;
      return null;
    }
    return args[name];
  };

  const databaseUrl = require_("database-url");
  const projectRef = require_("project-ref");
  const confirmToken = require_("confirm-token");
  const dumpFile = require_("dump-file");
  const checksumFile = require_("checksum-file");
  const maxDumpAgeHours = Number(args["max-dump-age-hours"] || 24);
  const expectedBranch = require_("expected-branch");
  const expectedSha = require_("expected-sha");

  if (!ok) {
    console.log("\nOne or more required flags were missing. Nothing was checked. Nothing was applied.");
    process.exit(1);
  }

  // 1. Project ref must match exactly (hardcoded expectation + operator-supplied confirmation must agree).
  if (projectRef !== EXPECTED_PROJECT_REF) {
    fail(`--project-ref "${projectRef}" does not equal the expected "${EXPECTED_PROJECT_REF}"`);
    ok = false;
  } else {
    pass(`--project-ref matches ${EXPECTED_PROJECT_REF}`);
  }
  if (!databaseUrl.includes(projectRef) && !databaseUrl.includes("127.0.0.1") && !databaseUrl.includes("localhost")) {
    fail(`--database-url does not visibly contain the project ref "${projectRef}" (and is not a local rehearsal target)`);
    ok = false;
  } else {
    pass(`--database-url is consistent with --project-ref (or is an explicit local target)`);
  }

  // 2. Confirmation token, exact literal match, must include the ref.
  const expectedToken = `I-UNDERSTAND-THIS-WILL-DROP-PRODUCTION-${EXPECTED_PROJECT_REF}`;
  if (confirmToken !== expectedToken) {
    fail(`--confirm-token did not match the required exact literal ("${expectedToken}")`);
    ok = false;
  } else {
    pass("confirm-token matches");
  }

  // 3. Branch/SHA must match the approved version.
  try {
    const currentBranch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
    const currentSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    if (currentBranch !== expectedBranch) {
      fail(`current branch "${currentBranch}" != --expected-branch "${expectedBranch}"`);
      ok = false;
    } else {
      pass(`branch matches ${expectedBranch}`);
    }
    if (currentSha !== expectedSha) {
      fail(`current HEAD "${currentSha}" != --expected-sha "${expectedSha}"`);
      ok = false;
    } else {
      pass(`HEAD SHA matches ${expectedSha}`);
    }
  } catch (e) {
    fail(`could not read git branch/SHA: ${e.message}`);
    ok = false;
  }

  // 4. A dump + valid checksum must exist and be recent.
  if (!fs.existsSync(dumpFile)) {
    fail(`--dump-file "${dumpFile}" does not exist`);
    ok = false;
  } else {
    const stat = fs.statSync(dumpFile);
    const ageHours = (Date.now() - stat.mtimeMs) / 3_600_000;
    if (ageHours > maxDumpAgeHours) {
      fail(`--dump-file is ${ageHours.toFixed(1)}h old, older than --max-dump-age-hours ${maxDumpAgeHours}`);
      ok = false;
    } else {
      pass(`dump file exists and is ${ageHours.toFixed(1)}h old (<= ${maxDumpAgeHours}h)`);
    }
    if (!fs.existsSync(checksumFile)) {
      fail(`--checksum-file "${checksumFile}" does not exist`);
      ok = false;
    } else {
      const recorded = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
      const actual = crypto.createHash("sha256").update(fs.readFileSync(dumpFile)).digest("hex");
      if (recorded !== actual) {
        fail(`dump checksum mismatch: recorded ${recorded}, actual ${actual}`);
        ok = false;
      } else {
        pass("dump checksum matches");
      }
    }
  }

  // 5-8. Live-database checks: must be reachable, empty of data, no
  // surprise migrations/functions/views, storage empty. Read-only.
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const { rows: tableRows } = await pool.query(`
      select tablename from pg_tables where schemaname='public' order by tablename;
    `);
    let anyTableNonEmpty = false;
    for (const { tablename } of tableRows) {
      const { rows } = await pool.query(`select count(*) as c from public."${tablename}"`);
      const c = Number(rows[0].c);
      if (c > 0) {
        fail(`public.${tablename} has ${c} row(s) — refusing (this gate requires every public table to be empty)`);
        ok = false;
        anyTableNonEmpty = true;
      }
    }
    if (tableRows.length > 0 && !anyTableNonEmpty) pass(`all ${tableRows.length} public tables are empty`);

    const { rows: authRows } = await pool.query(`select count(*) as c from auth.users;`);
    if (Number(authRows[0].c) > 0) {
      fail(`auth.users has ${authRows[0].c} row(s) — refusing`);
      ok = false;
    } else {
      pass("auth.users is empty");
    }

    const { rows: profileRows } = await pool.query(`select count(*) as c from public.profiles;`).catch(() => ({ rows: [{ c: 0 }] }));
    if (Number(profileRows[0]?.c || 0) > 0) {
      fail(`public.profiles has ${profileRows[0].c} row(s) — refusing`);
      ok = false;
    } else {
      pass("public.profiles is empty");
    }

    const { rows: bucketRows } = await pool.query(`select count(*) as c from storage.buckets;`);
    if (Number(bucketRows[0].c) > 0) {
      fail(`storage.buckets has ${bucketRows[0].c} row(s) — refusing`);
      ok = false;
    } else {
      pass("storage.buckets is empty");
    }

    const { rows: migRows } = await pool.query(`select to_regclass('drizzle.__drizzle_migrations') as t;`);
    if (migRows[0].t !== null) {
      const { rows: countRows } = await pool.query(`select count(*) as c from drizzle.__drizzle_migrations;`);
      const c = Number(countRows[0].c);
      if (c !== 0) {
        fail(`drizzle.__drizzle_migrations already has ${c} row(s) — a migration has already been applied; this gate is for a still-untouched project only`);
        ok = false;
      } else {
        pass("drizzle.__drizzle_migrations exists but is empty");
      }
    } else {
      pass("drizzle.__drizzle_migrations does not exist yet (expected for an untouched project)");
    }

    const { rows: funcRows } = await pool.query(`
      select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by proname;
    `);
    if (APPROVED_PUBLIC_FUNCTIONS.size === 0) {
      fail("APPROVED_PUBLIC_FUNCTIONS is empty in this script — an operator must populate it from the real, current inventory before this gate can pass. Refusing by design.");
      ok = false;
    } else {
      const unexpected = funcRows.map((r) => r.proname).filter((n) => !APPROVED_PUBLIC_FUNCTIONS.has(n));
      if (unexpected.length > 0) {
        fail(`unexpected function(s) in public not in the approved inventory: ${unexpected.join(", ")}`);
        ok = false;
      } else {
        pass(`all ${funcRows.length} public function(s) are in the approved inventory`);
      }
    }

    const { rows: viewRows } = await pool.query(`
      select table_name from information_schema.views where table_schema='public'
      union all
      select matviewname from pg_matviews where schemaname='public';
    `);
    if (viewRows.length > 0) {
      fail(`unexpected view(s)/materialized view(s) in public: ${viewRows.map((r) => r.table_name || r.matviewname).join(", ")}`);
      ok = false;
    } else {
      pass("no views or materialized views in public");
    }
  } catch (e) {
    fail(`database check error: ${e.message}`);
    ok = false;
  } finally {
    await pool.end();
  }

  console.log("");
  if (ok) {
    console.log("ALL CHECKS PASSED.");
    console.log("This script performed READ-ONLY checks only and applied nothing.");
    console.log("A passing result here is a PRECONDITION, not an authorization — the");
    console.log("actual DROP SCHEMA / migrate() sequence remains a separate, human-run,");
    console.log("explicitly-approved step. This script does not chain into it.");
    process.exit(0);
  } else {
    console.log("ONE OR MORE CHECKS FAILED. Refusing. Nothing was applied.");
    process.exit(1);
  }
}

main();
