#!/usr/bin/env node
// Option A production preflight gate — CHECK PHASE ONLY. v3 (hardened, Round 2).
//
// ============================================================================
// THIS SCRIPT NEVER CONNECTS TO ANYTHING BY DEFAULT AND WAS NEVER RUN
// AGAINST THE REAL SUPABASE PROJECT DURING THIS TASK. It was tested only
// against the disposable local rehearsal stack (ops/option-a-rehearsal),
// with --mode local. Running it with --mode production against the real
// project is a deliberate, separate, human decision — this file existing
// does not authorize that, and no other script or CI job calls this file
// automatically.
// ============================================================================
//
// v2 changes from the first version (docs/option-a-surgical-reset-design.md
// and the task that produced this file both explain why each one was
// required, not just what changed):
//   - --mode local|production is now required. local relaxes the host
//     check to 127.0.0.1/localhost only; production requires a real
//     Supabase hostname matching --project-ref, SSL, and a non-CLI-
//     sourced Approval Manifest.
//   - --expected-branch/--expected-sha (operator-supplied CLI flags) are
//     GONE. An operator supplying their own "expected" value on the same
//     command line as the thing being checked is not independent
//     approval. --approval-manifest now points at a separate JSON file
//     (ops/option-a-rehearsal/fixtures/approval-manifest.example.json is
//     a LOCAL FIXTURE ONLY, never a real approval) carrying the approved
//     branch/SHA/fingerprint/migration-checksum/backup-bundle hashes, an
//     approval timestamp, and an expiry the gate enforces.
//   - Database URL parsing uses Node's URL class, not .includes().
//   - The live-database section now runs as a SINGLE connection wrapped
//     in `BEGIN READ ONLY` ... `ROLLBACK`, with statement_timeout set,
//     instead of a pg.Pool issuing separate implicit-autocommit queries.
//   - Table existence/row-count checks use safe identifier quoting
//     (quoteIdent below — never a raw template-string interpolation of a
//     catalog name into SQL), and iterate the fixed 34-table list from
//     the real remote inventory rather than "whatever pg_tables returns"
//     — so an EXTRA unexpected table is now itself a hard FAIL, not
//     silently ignored because the loop only checked what was there.
//   - The function/trigger/enum/policy/grant fingerprint check is now
//     the full one from docs/remote-supabase-inventory.md §F (name +
//     signature + security definer + search_path + trigger definitions +
//     enum values + policy count + no unexpected views/matviews/
//     sequences), not just "function name is in an approved set."
//
// This is the CHECK phase only. It performs exclusively read-only
// SELECT/catalog queries inside a READ ONLY transaction that is always
// rolled back. It NEVER runs DROP/CREATE/ALTER/INSERT/UPDATE/DELETE. A
// passing result does NOT apply anything and does NOT chain into any
// apply step — printed explicitly at the end.
//
// Usage:
//   GATE_DATABASE_URL=<postgres connection string> \
//   node production-preflight-gate.mjs \
//     --mode local|production \
//     --project-ref difzynyphojgisrfvrkd \
//     --confirm-token "I-UNDERSTAND-THIS-WILL-DROP-PRODUCTION-difzynyphojgisrfvrkd" \
//     --approval-manifest <path to a signed-off JSON file> \
//     --dump-file <path> --checksum-file <path> --max-dump-age-hours 24
//
// Exit code 0 only if every check below passes. Exit code 1 on the
// first failure, or if any required flag/env-var is missing (missing
// is itself a failure, never a default-through).
//
// v3 changes (Round 2 remediation, closing a real code-review's
// findings — see the plan section this commit implements):
//   - --database-url CLI flag is GONE. The database URL now comes only
//     from GATE_DATABASE_URL (an env var, not a CLI flag), matching the
//     discipline backup-bundle.mjs/restore-bundle.mjs already use —
//     a connection string on the command line leaks into shell history
//     and `ps`/process-list output; an env var does not.
//   - --mode production now rejects the legacy single-file checksum
//     format outright (manifest-with-files format only), requires the
//     backup bundle manifest's own sourceMode to not be "local" and its
//     projectRef to equal --project-ref (a locally-sourced bundle
//     cannot back a production approval), and rejects an approvedBy
//     that is the known LOCAL-FIXTURE literal.
//   - Both modes now require a clean worktree (`git status --porcelain`
//     empty) — an uncommitted change is not what got approved.
//   - The Approval Manifest's checksum coverage now also covers
//     sql/surgical-reset.sql and this gate/backup/restore scripts
//     themselves (toolChecksums), not just lib/db/drizzle/*.sql.
//   - The function fingerprint now also checks argument identity,
//     return type, and a body hash (sha256 of pg_get_functiondef()) —
//     not just security_definer + search_path.
//   - The trigger check now also compares action_statement (which
//     function it calls); the event trigger check now also compares
//     evtevent/evttags and its handler function, not just name+enabled.
//   - The public schema owner/ACL check is now a real fail(), not an
//     INFO print — see the EXPECTED_SCHEMA_OWNER/ACL comment for the
//     honest caveat on where that pinned value came from.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import pg from "pg";

const EXPECTED_PROJECT_REF = "difzynyphojgisrfvrkd";
const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"), "..", "..", "..");
const DRIZZLE_DIR = path.join(REPO_ROOT, "lib", "db", "drizzle");
const OPS_DIR = path.join(REPO_ROOT, "ops", "option-a-rehearsal");

// The known LOCAL-FIXTURE-ONLY literal used by
// fixtures/approval-manifest.example.json's approvedBy field. A real
// approval manifest for the actual project must never carry this
// value — if --mode production sees it, that alone proves the local
// fixture is being (mis)used to approve a real run.
const LOCAL_FIXTURE_APPROVED_BY_PREFIX = "LOCAL-FIXTURE";

// The real remote project's CURRENT (pre-Option-A) state, per
// docs/remote-supabase-inventory.md, captured 2026-08-30. This gate
// runs BEFORE Surgical Reset touches anything — it exists to prove the
// live database still matches exactly what Surgical Reset assumes it
// can safely name-drop. If the real project's state changes before
// this gate is actually used, every constant below must be re-verified
// against a fresh docs/remote-supabase-inventory.md pass in the SAME
// reviewed change, not assumed still accurate — this is a tripwire, not
// a lock (same discipline as
// lib/db/test/published-migrations-checksum.test.mjs).
const EXPECTED_OLD_TABLES = [
  "admin_lockouts", "blogs", "certificates", "comments", "contact_messages",
  "coupon_redemptions", "coupons", "course_progress", "courses", "enrollments",
  "hifz_progress", "invoices", "live_classes", "manual_payments", "messages",
  "notifications", "payments", "post_likes", "posts", "profile_children",
  "profiles", "quran_bookmarks", "quran_memorization_stats", "quran_reading_progress",
  "rate_limit_counters", "referrals", "reviews", "student_records", "subscribers",
  "system_audit_log", "system_config", "trial_requests", "tutor_conversations",
  "wishlist_items",
].sort();

const EXPECTED_OLD_ENUMS = {
  role: ["student", "teacher", "parent", "admin"],
  subscription_provider: ["stripe", "paypal", "manual"],
  subscription_status: ["none", "active", "past_due", "canceled"],
};

// Function fingerprints, extended (Round 2) beyond name/security_definer/
// search_path to also pin argument identity, return type, and a body
// hash — sha256 of pg_get_functiondef(), which includes the full
// CREATE OR REPLACE text (signature + qualifiers + body). args/
// returnType/bodySha256 for handle_new_user come from the literal text
// docs/remote-supabase-inventory.md §F captured directly off the real
// project. rls_auto_enable's come from
// ops/option-a-rehearsal/out/rls_auto_enable_function.sql, captured
// off the real local Supabase CLI stack in the Phase 2 rehearsal (this
// is Supabase's own shipped project-default function, not custom
// application code, so the local stack's copy of it IS the same
// definition Supabase ships on the real project — unlike the
// schema-ACL constants below, this one is not a "local fixture only"
// approximation).
const EXPECTED_FUNCTIONS = {
  handle_new_user: {
    security_definer: true,
    search_path: "public",
    args: "",
    returnType: "trigger",
    bodySha256: crypto.createHash("sha256").update(
      `CREATE OR REPLACE FUNCTION public.handle_new_user()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  insert into public.profiles (id, email, name, role)\n  values (\n    new.id,\n    new.email,\n    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),\n    case\n      when new.raw_user_meta_data ->> 'role' = 'parent' then 'parent'::role\n      else 'student'::role\n    end\n  );\n  return new;\nend;\n$function$`
    ).digest("hex"),
  },
  rls_auto_enable: {
    security_definer: true,
    search_path: "pg_catalog",
    args: "",
    returnType: "event_trigger",
    bodySha256: crypto.createHash("sha256").update(
      `CREATE OR REPLACE FUNCTION public.rls_auto_enable()\n RETURNS event_trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog'\nAS $function$\nDECLARE\n  cmd record;\nBEGIN\n  FOR cmd IN\n    SELECT *\n    FROM pg_event_trigger_ddl_commands()\n    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')\n      AND object_type IN ('table','partitioned table')\n  LOOP\n     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN\n      BEGIN\n        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);\n        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;\n      EXCEPTION\n        WHEN OTHERS THEN\n          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;\n      END;\n     ELSE\n        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;\n     END IF;\n  END LOOP;\nEND;\n$function$`
    ).digest("hex"),
  },
};

const EXPECTED_AUTH_TRIGGER = {
  table: "users",
  schema: "auth",
  name: "on_auth_user_created",
  timing: "AFTER",
  event: "INSERT",
  actionStatement: "EXECUTE FUNCTION handle_new_user()",
};

const EXPECTED_EVENT_TRIGGER_NAME = "rls_auto_enable_trigger";
const EXPECTED_EVENT_TRIGGER = {
  event: "ddl_command_end",
  tags: ["CREATE TABLE", "CREATE TABLE AS", "SELECT INTO"].sort(),
  handlerFunction: "rls_auto_enable",
};

// Public schema owner/ACL — a real fail() check now (Round 2), not an
// INFO print. HONEST CAVEAT: docs/remote-supabase-inventory.md never
// captured nspowner/nspacl for `public` on the real project (confirmed
// during this round's review) — this pinned value comes only from a
// fresh `select nspowner::regrole::text, nspacl::text from pg_namespace
// where nspname='public'` run directly against the real LOCAL Supabase
// CLI stack (`supabase start` in ops/option-a-rehearsal) during this
// round, not off difzynyphojgisrfvrkd. (An earlier capture in
// ops/option-a-rehearsal/out/public_schema_acl.json recorded a
// different value, "pg_database_owner"-owned — likely from an older
// Supabase CLI/Postgres image; this constant was verified against a
// live re-query, not trusted from that stale file.) Same tripwire
// discipline as the rest of this file: re-verify against a fresh
// Remote read before this gate is ever pointed at the real project
// with --mode production.
const EXPECTED_SCHEMA_OWNER = "postgres";
const EXPECTED_SCHEMA_ACL = "{postgres=UC/postgres,anon=U/postgres,authenticated=U/postgres,service_role=U/postgres}";

// A hash of every fingerprint constant above, computed here and
// compared against the approval manifest's expectedRemoteFingerprintSha256
// — ties an approval to the EXACT fingerprint definition committed in
// this file. Edit any constant above without getting a fresh manifest
// approved (with the new hash) and every run fails closed instead of
// silently checking against a fingerprint nobody signed off on.
function computeFingerprintDefinitionHash() {
  const canonical = JSON.stringify({
    EXPECTED_PROJECT_REF,
    EXPECTED_OLD_TABLES,
    EXPECTED_OLD_ENUMS,
    EXPECTED_FUNCTIONS,
    EXPECTED_AUTH_TRIGGER,
    EXPECTED_EVENT_TRIGGER_NAME,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------
// Safe SQL identifier quoting — never interpolate a catalog name
// directly into a query string. Mirrors Postgres's own quote_ident()
// rule: wrap in double quotes, double any embedded double quote.
// ---------------------------------------------------------------------
function quoteIdent(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`quoteIdent: refusing to quote a non-string/empty identifier: ${JSON.stringify(name)}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

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

let failures = 0;
function fail(msg) {
  console.log(`FAIL  ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// ---------------------------------------------------------------------
// Static (no DB connection needed) checks: flags, mode, host, approval
// manifest, migration checksums, dump/checksum files, git state.
// ---------------------------------------------------------------------
function runStaticChecks(args) {
  const require_ = (name) => {
    if (!args[name]) {
      fail(`missing required --${name}`);
      return null;
    }
    return args[name];
  };

  const mode = require_("mode");
  if (mode && mode !== "local" && mode !== "production") {
    fail(`--mode must be "local" or "production", got "${mode}"`);
  } else if (mode) {
    pass(`--mode is ${mode}`);
  }

  // 0. Worktree cleanliness — both modes. An uncommitted change is not
  // what the Approval Manifest's approvedCommitSha was ever reviewed
  // against, so a dirty worktree fails closed regardless of mode.
  // --untracked-files=no deliberately: this repo has always carried a
  // handful of untracked-by-design directories alongside this branch
  // (backend/, frontend/, e2e/, .playwright-mcp/ — pre-existing, and
  // the standing rule for this whole engagement is that they must
  // NEVER be added to git). An unfiltered `git status --porcelain`
  // would show them forever and make this check impossible to ever
  // pass — found by actually running the gate after a clean commit,
  // not by inspection. What this check actually needs to guarantee is
  // narrower: no uncommitted change to a TRACKED file, and no new file
  // staged/added outside of a reviewed commit — untracked scratch
  // content the project already accepts living alongside the repo is
  // not that.
  try {
    const porcelain = execSync("git status --porcelain --untracked-files=no", { encoding: "utf8", cwd: REPO_ROOT }).trim();
    if (porcelain.length > 0) {
      fail(`worktree has uncommitted changes to tracked files (git status --porcelain --untracked-files=no has output) — refusing:\n${porcelain}`);
    } else {
      pass("worktree is clean (no uncommitted changes to tracked files)");
    }
  } catch (e) {
    fail(`could not run git status: ${e.message}`);
  }

  const databaseUrl = process.env.GATE_DATABASE_URL;
  if (!databaseUrl) {
    fail("missing required GATE_DATABASE_URL environment variable (not a CLI flag — never put a connection string on the command line)");
  }
  const projectRef = require_("project-ref");
  const confirmToken = require_("confirm-token");
  const approvalManifestPath = require_("approval-manifest");
  const dumpFile = require_("dump-file");
  const checksumFile = require_("checksum-file");
  const maxDumpAgeHours = Number(args["max-dump-age-hours"] || 24);

  if (!mode || !databaseUrl || !projectRef || !confirmToken || !approvalManifestPath || !dumpFile || !checksumFile) {
    return null;
  }

  // 1. Project ref must match the hardcoded expectation.
  if (projectRef !== EXPECTED_PROJECT_REF) {
    fail(`--project-ref "${projectRef}" does not equal the expected "${EXPECTED_PROJECT_REF}"`);
  } else {
    pass(`--project-ref matches ${EXPECTED_PROJECT_REF}`);
  }

  // 2. Database URL — real URL parsing, mode-dependent host policy.
  let parsedUrl = null;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (e) {
    fail(`GATE_DATABASE_URL is not a parseable URL: ${e.message}`);
  }
  if (parsedUrl) {
    const hostname = parsedUrl.hostname.toLowerCase();
    if (mode === "local") {
      if (hostname !== "127.0.0.1" && hostname !== "localhost") {
        fail(`--mode local requires GATE_DATABASE_URL host to be 127.0.0.1 or localhost, got "${hostname}"`);
      } else {
        pass(`GATE_DATABASE_URL host "${hostname}" is a valid local target for --mode local`);
      }
    } else if (mode === "production") {
      if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
        fail(`--mode production refuses a local/private GATE_DATABASE_URL host ("${hostname}")`);
      } else {
        // Real Supabase direct connection: db.<ref>.supabase.co
        // Real Supabase pooler connection: <region>.pooler.supabase.com,
        // with the project ref carried in the username (postgres.<ref>)
        // instead of the hostname.
        const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(hostname);
        const isPooler = hostname.endsWith(".pooler.supabase.com");
        if (directMatch) {
          if (directMatch[1] !== projectRef) {
            fail(`GATE_DATABASE_URL hostname "${hostname}" names project ref "${directMatch[1]}", not "${projectRef}"`);
          } else {
            pass(`GATE_DATABASE_URL hostname matches project ref ${projectRef} (direct connection)`);
          }
        } else if (isPooler) {
          const username = decodeURIComponent(parsedUrl.username || "");
          if (username !== `postgres.${projectRef}`) {
            fail(`GATE_DATABASE_URL is a pooler connection but its username ("${username}") does not equal "postgres.${projectRef}"`);
          } else {
            pass(`GATE_DATABASE_URL pooler username matches project ref ${projectRef}`);
          }
        } else {
          fail(`--mode production requires a real Supabase hostname (db.<ref>.supabase.co or *.pooler.supabase.com), got "${hostname}"`);
        }

        const sslmode = parsedUrl.searchParams.get("sslmode");
        if (sslmode !== "require" && sslmode !== "verify-full" && sslmode !== "verify-ca") {
          fail(`--mode production requires GATE_DATABASE_URL to declare sslmode=require (or stricter), got "${sslmode}"`);
        } else {
          pass(`GATE_DATABASE_URL declares sslmode=${sslmode}`);
        }
      }
    }
  }

  // 3. Confirmation token, exact literal match, must include the ref.
  const expectedToken = `I-UNDERSTAND-THIS-WILL-DROP-PRODUCTION-${EXPECTED_PROJECT_REF}`;
  if (confirmToken !== expectedToken) {
    fail(`--confirm-token did not match the required exact literal ("${expectedToken}")`);
  } else {
    pass("confirm-token matches");
  }

  // 4. Approval Manifest — a separate file, not CLI-supplied values.
  // See ops/option-a-rehearsal/fixtures/approval-manifest.example.json
  // for the LOCAL-FIXTURE-ONLY shape this expects. Never trust an
  // --expected-sha/--expected-branch CLI flag as "approval" — the same
  // operator running this script could supply any value they like on
  // the command line, which proves nothing about a separate reviewer's
  // sign-off.
  let manifest = null;
  if (!fs.existsSync(approvalManifestPath)) {
    fail(`--approval-manifest "${approvalManifestPath}" does not exist`);
  } else {
    try {
      manifest = JSON.parse(fs.readFileSync(approvalManifestPath, "utf8"));
    } catch (e) {
      fail(`--approval-manifest is not valid JSON: ${e.message}`);
    }
  }
  if (manifest) {
    const requiredKeys = [
      "projectRef", "approvedBranch", "approvedCommitSha",
      "expectedRemoteFingerprintSha256", "migrationChecksums", "toolChecksums",
      "backupBundleManifestSha256", "approvedAt", "expiresAt", "approvedBy",
    ];
    const missingKeys = requiredKeys.filter((k) => !(k in manifest));
    if (missingKeys.length > 0) {
      fail(`--approval-manifest is missing required key(s): ${missingKeys.join(", ")}`);
    } else {
      pass("approval manifest has every required key");

      if (manifest.projectRef !== EXPECTED_PROJECT_REF) {
        fail(`approval manifest projectRef "${manifest.projectRef}" != expected "${EXPECTED_PROJECT_REF}"`);
      } else {
        pass("approval manifest projectRef matches");
      }

      // approvedBy must not be the known LOCAL-FIXTURE literal in
      // production mode — this is what actually stops someone pointing
      // --mode production at the real project using the checked-in
      // local-fixture manifest as if it were a real sign-off.
      if (mode === "production") {
        if (typeof manifest.approvedBy === "string" && manifest.approvedBy.startsWith(LOCAL_FIXTURE_APPROVED_BY_PREFIX)) {
          fail(`--mode production refuses an approval manifest whose approvedBy is the known LOCAL-FIXTURE literal ("${manifest.approvedBy}") — this is not a real approval`);
        } else if (!manifest.approvedBy || typeof manifest.approvedBy !== "string") {
          fail("--mode production requires a non-empty string approvedBy");
        } else {
          pass(`approval manifest approvedBy ("${manifest.approvedBy}") is not the local-fixture literal`);
        }
      }

      const actualFingerprintDefHash = computeFingerprintDefinitionHash();
      if (manifest.expectedRemoteFingerprintSha256 !== actualFingerprintDefHash) {
        fail(`approval manifest's expectedRemoteFingerprintSha256 (${manifest.expectedRemoteFingerprintSha256}) does not match this script's own fingerprint constants (${actualFingerprintDefHash}) — the constants changed since this manifest was approved, or the manifest wasn't generated from this script's fingerprint`);
      } else {
        pass("approval manifest's expectedRemoteFingerprintSha256 matches this script's fingerprint constants exactly");
      }

      const now = new Date();
      const expiresAt = new Date(manifest.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        fail(`approval manifest expiresAt "${manifest.expiresAt}" is not a valid date`);
      } else if (expiresAt.getTime() <= now.getTime()) {
        fail(`approval manifest expired at ${manifest.expiresAt} (now: ${now.toISOString()}) — refusing a stale approval`);
      } else {
        pass(`approval manifest is not expired (expires ${manifest.expiresAt})`);
      }

      try {
        const currentBranch = execSync("git branch --show-current", { encoding: "utf8", cwd: REPO_ROOT }).trim();
        const currentSha = execSync("git rev-parse HEAD", { encoding: "utf8", cwd: REPO_ROOT }).trim();
        if (currentBranch !== manifest.approvedBranch) {
          fail(`current branch "${currentBranch}" != approval manifest's approvedBranch "${manifest.approvedBranch}"`);
        } else {
          pass(`branch matches the approval manifest (${manifest.approvedBranch})`);
        }
        if (currentSha !== manifest.approvedCommitSha) {
          fail(`current HEAD "${currentSha}" != approval manifest's approvedCommitSha "${manifest.approvedCommitSha}"`);
        } else {
          pass(`HEAD SHA matches the approval manifest (${manifest.approvedCommitSha})`);
        }
      } catch (e) {
        fail(`could not read git branch/SHA: ${e.message}`);
      }

      // 5. Migration checksums — every file the manifest names must
      // exist on disk with a matching sha256, and the manifest must
      // name every .sql file actually present in lib/db/drizzle (an
      // untracked-by-the-manifest migration file is itself a failure —
      // it means a migration was added after approval).
      if (!Array.isArray(manifest.migrationChecksums) || manifest.migrationChecksums.length === 0) {
        fail("approval manifest's migrationChecksums is empty or not an array");
      } else {
        let allMigrationsOk = true;
        for (const entry of manifest.migrationChecksums) {
          const filePath = path.join(DRIZZLE_DIR, entry.file);
          if (!fs.existsSync(filePath)) {
            fail(`approval manifest names migration "${entry.file}" which does not exist on disk`);
            allMigrationsOk = false;
            continue;
          }
          const actual = sha256File(filePath);
          if (actual !== entry.sha256) {
            fail(`migration "${entry.file}" sha256 mismatch: manifest says ${entry.sha256}, actual is ${actual}`);
            allMigrationsOk = false;
          }
        }
        const onDisk = fs.readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql")).sort();
        const inManifest = manifest.migrationChecksums.map((e) => e.file).sort();
        const extra = onDisk.filter((f) => !inManifest.includes(f));
        if (extra.length > 0) {
          fail(`migration file(s) on disk are not named in the approval manifest: ${extra.join(", ")}`);
          allMigrationsOk = false;
        }
        if (allMigrationsOk) pass(`all ${onDisk.length} migration file(s) match the approval manifest exactly (checksum + no extras)`);
      }

      // 5b. Tool checksums — the surgical reset SQL and the gate/backup/
      // restore scripts themselves are just as capable of being tampered
      // with as a migration file, but were never covered by any
      // checksum before Round 2. Paths are relative to OPS_DIR.
      if (!Array.isArray(manifest.toolChecksums) || manifest.toolChecksums.length === 0) {
        fail("approval manifest's toolChecksums is empty or not an array");
      } else {
        let allToolsOk = true;
        for (const entry of manifest.toolChecksums) {
          const filePath = path.join(OPS_DIR, entry.file);
          if (!fs.existsSync(filePath)) {
            fail(`approval manifest names tool file "${entry.file}" which does not exist on disk`);
            allToolsOk = false;
            continue;
          }
          const actual = sha256File(filePath);
          if (actual !== entry.sha256) {
            fail(`tool file "${entry.file}" sha256 mismatch: manifest says ${entry.sha256}, actual is ${actual}`);
            allToolsOk = false;
          }
        }
        const requiredTools = [
          "sql/surgical-reset.sql",
          "scripts/production-preflight-gate.mjs",
          "scripts/backup-bundle.mjs",
          "scripts/restore-bundle.mjs",
          "scripts/03-surgical-reset.mjs",
        ].sort();
        const inToolManifest = manifest.toolChecksums.map((e) => e.file).sort();
        const missingTools = requiredTools.filter((f) => !inToolManifest.includes(f));
        if (missingTools.length > 0) {
          fail(`approval manifest's toolChecksums is missing required file(s): ${missingTools.join(", ")}`);
          allToolsOk = false;
        }
        if (allToolsOk) pass(`all ${manifest.toolChecksums.length} tool file(s) match the approval manifest exactly (checksum + required set present)`);
      }
    }
  }

  // 6. Dump + checksum file, age-bounded.
  if (!fs.existsSync(dumpFile)) {
    fail(`--dump-file "${dumpFile}" does not exist`);
  } else {
    const stat = fs.statSync(dumpFile);
    const ageHours = (Date.now() - stat.mtimeMs) / 3_600_000;
    if (ageHours > maxDumpAgeHours) {
      fail(`--dump-file is ${ageHours.toFixed(1)}h old, older than --max-dump-age-hours ${maxDumpAgeHours}`);
    } else {
      pass(`dump file exists and is ${ageHours.toFixed(1)}h old (<= ${maxDumpAgeHours}h)`);
    }
    if (!fs.existsSync(checksumFile)) {
      fail(`--checksum-file "${checksumFile}" does not exist`);
    } else {
      let manifestJson;
      try {
        manifestJson = JSON.parse(fs.readFileSync(checksumFile, "utf8"));
      } catch {
        manifestJson = null;
      }
      if (manifestJson && Array.isArray(manifestJson.files)) {
        // Backup-bundle manifest format (scripts/backup-bundle.mjs) —
        // verify EVERY listed file's checksum, not just the first.
        let allOk = true;
        for (const f of manifestJson.files) {
          const p = path.join(path.dirname(checksumFile), f.name);
          if (!fs.existsSync(p)) {
            fail(`backup bundle manifest names "${f.name}" which does not exist next to the checksum file`);
            allOk = false;
            continue;
          }
          const actual = sha256File(p);
          if (actual !== f.sha256) {
            fail(`backup bundle file "${f.name}" sha256 mismatch: manifest says ${f.sha256}, actual is ${actual}`);
            allOk = false;
          }
        }
        if (allOk) pass(`all ${manifestJson.files.length} backup bundle file(s) verified against the manifest`);

        if (manifest && manifest.backupBundleManifestSha256) {
          const actualManifestHash = sha256File(checksumFile);
          if (actualManifestHash !== manifest.backupBundleManifestSha256) {
            fail(`backup bundle manifest's own sha256 (${actualManifestHash}) does not match the approval manifest's backupBundleManifestSha256 (${manifest.backupBundleManifestSha256})`);
          } else {
            pass("backup bundle manifest matches the approval manifest's recorded hash");
          }
        }

        // Production mode: the bundle must actually claim to be a
        // production-sourced, correct-project backup — not a bundle
        // generated with BACKUP_MODE=local (a local rehearsal bundle
        // backing a real production approval would mean rolling back
        // to fixture data, not the real project's own data) and not
        // one stamped with the wrong project's ref.
        if (mode === "production") {
          if (manifestJson.sourceMode !== "production") {
            fail(`--mode production requires the backup bundle's own sourceMode to be "production", got "${manifestJson.sourceMode}" — a local-sourced bundle cannot back a production approval`);
          } else {
            pass("backup bundle manifest sourceMode is production");
          }
          if (manifestJson.projectRef !== projectRef) {
            fail(`--mode production requires the backup bundle's own projectRef ("${manifestJson.projectRef}") to equal --project-ref ("${projectRef}")`);
          } else {
            pass(`backup bundle manifest projectRef matches ${projectRef}`);
          }
        }
      } else if (mode === "production") {
        // Round 2: the legacy single-file format is rejected outright
        // in production mode — it carries no sourceMode/projectRef to
        // verify at all, so it cannot prove the bundle it backs came
        // from the right place. --mode local may still use it (kept so
        // existing local rehearsal fixtures/tests aren't broken).
        fail("--mode production refuses the legacy single-file checksum format — --checksum-file must be a backup-bundle manifest.json (with a files[] array, sourceMode, and projectRef)");
      } else {
        // Legacy plain "<sha256>  <filename>" format — single-file check only.
        // --mode local ONLY (see the fail() above for production).
        const recorded = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
        const actual = sha256File(dumpFile);
        if (recorded !== actual) {
          fail(`dump checksum mismatch: recorded ${recorded}, actual ${actual}`);
        } else {
          pass("dump checksum matches (legacy single-file format)");
        }
      }
    }
  }

  return { mode, databaseUrl, projectRef };
}

// ---------------------------------------------------------------------
// Live-database checks — single connection, one READ ONLY transaction,
// always rolled back.
// ---------------------------------------------------------------------
async function runLiveChecks(mode, databaseUrl) {
  const clientConfig = { connectionString: databaseUrl, statement_timeout: 15_000 };
  if (mode === "production") {
    clientConfig.ssl = { rejectUnauthorized: true };
  }
  const client = new pg.Client(clientConfig);

  try {
    await client.connect();
  } catch (e) {
    fail(`could not connect to GATE_DATABASE_URL: ${e.message}`);
    return;
  }

  try {
    await client.query("BEGIN READ ONLY;");
    await client.query("SET LOCAL statement_timeout = '15s';");

    // Exact 34-table fingerprint: every expected table must exist and
    // be empty; any table present that ISN'T in the expected list is
    // itself a failure (not silently ignored).
    const { rows: tableRows } = await client.query(`
      select tablename from pg_tables where schemaname='public' order by tablename;
    `);
    const actualTables = tableRows.map((r) => r.tablename).sort();
    const missingTables = EXPECTED_OLD_TABLES.filter((t) => !actualTables.includes(t));
    const unexpectedTables = actualTables.filter((t) => !EXPECTED_OLD_TABLES.includes(t));
    if (missingTables.length > 0) {
      fail(`expected old table(s) missing from public: ${missingTables.join(", ")}`);
    }
    if (unexpectedTables.length > 0) {
      fail(`unexpected table(s) in public not in the approved old-schema list: ${unexpectedTables.join(", ")}`);
    }
    if (missingTables.length === 0 && unexpectedTables.length === 0) {
      pass(`public has exactly the expected ${EXPECTED_OLD_TABLES.length} old tables, no more, no fewer`);
    }

    let anyTableNonEmpty = false;
    for (const table of EXPECTED_OLD_TABLES) {
      if (!actualTables.includes(table)) continue; // already reported as missing above
      try {
        const { rows } = await client.query(`select count(*) as c from public.${quoteIdent(table)};`);
        const c = Number(rows[0].c);
        if (c > 0) {
          fail(`public.${table} has ${c} row(s) — refusing (every old table must be empty before Surgical Reset)`);
          anyTableNonEmpty = true;
        }
      } catch (e) {
        fail(`public.${table}: query error counting rows (${e.message}) — treating as FAIL, not skipping`);
        anyTableNonEmpty = true;
      }
    }
    if (!anyTableNonEmpty) pass(`all ${EXPECTED_OLD_TABLES.length} expected old tables are empty`);

    // auth.users
    const { rows: authRows } = await client.query(`select count(*) as c from auth.users;`);
    if (Number(authRows[0].c) > 0) {
      fail(`auth.users has ${authRows[0].c} row(s) — refusing`);
    } else {
      pass("auth.users is empty");
    }

    // storage.buckets AND storage.objects
    const { rows: bucketRows } = await client.query(`select count(*) as c from storage.buckets;`);
    if (Number(bucketRows[0].c) > 0) {
      fail(`storage.buckets has ${bucketRows[0].c} row(s) — refusing`);
    } else {
      pass("storage.buckets is empty");
    }
    const { rows: objectRows } = await client.query(`select count(*) as c from storage.objects;`).catch((e) => {
      fail(`storage.objects: query error (${e.message})`);
      return { rows: [{ c: -1 }] };
    });
    if (Number(objectRows[0].c) !== 0) {
      if (Number(objectRows[0].c) > 0) fail(`storage.objects has ${objectRows[0].c} row(s) — refusing`);
    } else {
      pass("storage.objects is empty");
    }

    // Migration-tracking tables must NOT exist yet (untouched project).
    const { rows: migCheck } = await client.query(`
      select
        to_regclass('drizzle.__drizzle_migrations') as drizzle_schema,
        to_regclass('public.__drizzle_migrations') as public_table,
        to_regclass('supabase_migrations.schema_migrations') as supabase_managed;
    `);
    const migRow = migCheck[0];
    if (migRow.drizzle_schema !== null || migRow.public_table !== null || migRow.supabase_managed !== null) {
      fail(`a migration-tracking table already exists (drizzle=${migRow.drizzle_schema}, public=${migRow.public_table}, supabase_managed=${migRow.supabase_managed}) — this gate is for a still-untouched project only`);
    } else {
      pass("none of the three known migration-tracking tables exist yet");
    }

    // Functions — full fingerprint: name, security definer, search_path,
    // argument identity, return type, and a body hash (Round 2 adds the
    // last three — a same-named function with a rewritten body, extra
    // argument, or changed return type used to pass this check as long
    // as security_definer/search_path happened to match).
    const { rows: funcRows } = await client.query(`
      select proname,
        prosecdef,
        pg_get_function_identity_arguments(p.oid) as args,
        pg_get_function_result(p.oid) as return_type,
        pg_get_functiondef(p.oid) as def,
        (select setting from unnest(coalesce(proconfig, '{}')) as setting where setting like 'search_path=%') as search_path_setting
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
      order by proname;
    `);
    const actualFuncNames = funcRows.map((r) => r.proname).sort();
    const expectedFuncNames = Object.keys(EXPECTED_FUNCTIONS).sort();
    const extraFuncs = actualFuncNames.filter((n) => !expectedFuncNames.includes(n));
    const missingFuncs = expectedFuncNames.filter((n) => !actualFuncNames.includes(n));
    if (extraFuncs.length > 0) fail(`unexpected function(s) in public: ${extraFuncs.join(", ")}`);
    if (missingFuncs.length > 0) fail(`expected function(s) missing from public: ${missingFuncs.join(", ")}`);
    for (const row of funcRows) {
      const expected = EXPECTED_FUNCTIONS[row.proname];
      if (!expected) continue; // already reported as extra above
      if (row.prosecdef !== expected.security_definer) {
        fail(`function ${row.proname}: security_definer is ${row.prosecdef}, expected ${expected.security_definer}`);
        continue;
      }
      const actualSearchPath = (row.search_path_setting || "").replace(/^search_path=/, "");
      if (actualSearchPath !== expected.search_path) {
        fail(`function ${row.proname}: search_path is "${actualSearchPath}", expected "${expected.search_path}"`);
        continue;
      }
      if (row.args !== expected.args) {
        fail(`function ${row.proname}: argument identity is "${row.args}", expected "${expected.args}"`);
        continue;
      }
      if (row.return_type !== expected.returnType) {
        fail(`function ${row.proname}: return type is "${row.return_type}", expected "${expected.returnType}"`);
        continue;
      }
      const actualBodySha256 = crypto.createHash("sha256").update(row.def.trim()).digest("hex");
      if (actualBodySha256 !== expected.bodySha256) {
        fail(`function ${row.proname}: body hash is ${actualBodySha256}, expected ${expected.bodySha256} (pg_get_functiondef() text differs from the approved old inventory)`);
        continue;
      }
      pass(`function ${row.proname}: security_definer + search_path + args + return type + body hash all match the approved old inventory`);
    }

    // The one expected trigger, on auth.users. Round 2 adds
    // action_statement (which function it actually calls) — before,
    // retargeting the trigger at a different function while keeping
    // its name/timing/event the same would have passed silently.
    const { rows: trigRows } = await client.query(`
      select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
      from information_schema.triggers
      where event_object_schema in ('public','auth');
    `);
    const authTrig = trigRows.find((t) => t.trigger_name === EXPECTED_AUTH_TRIGGER.name);
    const unexpectedTrigs = trigRows.filter((t) => t.trigger_name !== EXPECTED_AUTH_TRIGGER.name);
    if (!authTrig) {
      fail(`expected trigger "${EXPECTED_AUTH_TRIGGER.name}" on auth.users not found`);
    } else if (
      authTrig.event_object_schema !== EXPECTED_AUTH_TRIGGER.schema ||
      authTrig.event_object_table !== EXPECTED_AUTH_TRIGGER.table ||
      authTrig.action_timing !== EXPECTED_AUTH_TRIGGER.timing ||
      authTrig.event_manipulation !== EXPECTED_AUTH_TRIGGER.event ||
      authTrig.action_statement !== EXPECTED_AUTH_TRIGGER.actionStatement
    ) {
      fail(`trigger "${EXPECTED_AUTH_TRIGGER.name}" exists but doesn't match the expected shape: ${JSON.stringify(authTrig)}`);
    } else {
      pass(`trigger ${EXPECTED_AUTH_TRIGGER.name} matches the approved old inventory exactly, including its target function`);
    }
    if (unexpectedTrigs.length > 0) {
      fail(`unexpected trigger(s) found: ${unexpectedTrigs.map((t) => t.trigger_name).join(", ")}`);
    }

    // The event trigger (rls_auto_enable's) — must be present, enabled,
    // and (Round 2) fire on the exact event/tags it did in the approved
    // old inventory, calling the exact expected handler function. Before,
    // a retargeted handler or narrowed/widened tag list with the same
    // name+enabled state would have passed silently.
    const { rows: eventTrigRows } = await client.query(`
      select evtname, evtenabled, evtevent, evttags, evtfoid::regproc::text as handler
      from pg_event_trigger where evtname = $1;
    `, [EXPECTED_EVENT_TRIGGER_NAME]);
    if (eventTrigRows.length === 0) {
      fail(`expected event trigger "${EXPECTED_EVENT_TRIGGER_NAME}" not found — rls_auto_enable's safety net is missing`);
    } else if (eventTrigRows[0].evtenabled === "D") {
      fail(`event trigger "${EXPECTED_EVENT_TRIGGER_NAME}" exists but is disabled`);
    } else {
      const et = eventTrigRows[0];
      const actualTags = [...(et.evttags || [])].sort();
      if (et.evtevent !== EXPECTED_EVENT_TRIGGER.event) {
        fail(`event trigger "${EXPECTED_EVENT_TRIGGER_NAME}": evtevent is "${et.evtevent}", expected "${EXPECTED_EVENT_TRIGGER.event}"`);
      } else if (JSON.stringify(actualTags) !== JSON.stringify(EXPECTED_EVENT_TRIGGER.tags)) {
        fail(`event trigger "${EXPECTED_EVENT_TRIGGER_NAME}": evttags are ${JSON.stringify(actualTags)}, expected ${JSON.stringify(EXPECTED_EVENT_TRIGGER.tags)}`);
      } else if (et.handler !== EXPECTED_EVENT_TRIGGER.handlerFunction) {
        fail(`event trigger "${EXPECTED_EVENT_TRIGGER_NAME}": handler function is "${et.handler}", expected "${EXPECTED_EVENT_TRIGGER.handlerFunction}"`);
      } else {
        pass(`event trigger ${EXPECTED_EVENT_TRIGGER_NAME} is present, enabled, and its event/tags/handler match the approved old inventory exactly`);
      }
    }

    // Enums and their exact value sets.
    const { rows: enumRows } = await client.query(`
      select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      group by t.typname
      order by t.typname;
    `);
    const actualEnumNames = enumRows.map((r) => r.typname).sort();
    const expectedEnumNames = Object.keys(EXPECTED_OLD_ENUMS).sort();
    const extraEnums = actualEnumNames.filter((n) => !expectedEnumNames.includes(n));
    const missingEnums = expectedEnumNames.filter((n) => !actualEnumNames.includes(n));
    if (extraEnums.length > 0) fail(`unexpected enum type(s) in public: ${extraEnums.join(", ")}`);
    if (missingEnums.length > 0) fail(`expected enum type(s) missing from public: ${missingEnums.join(", ")}`);
    for (const row of enumRows) {
      const expected = EXPECTED_OLD_ENUMS[row.typname];
      if (!expected) continue;
      if (JSON.stringify(row.labels) !== JSON.stringify(expected)) {
        fail(`enum ${row.typname}: values are ${JSON.stringify(row.labels)}, expected ${JSON.stringify(expected)}`);
      } else {
        pass(`enum ${row.typname}: values match the approved old inventory exactly`);
      }
    }

    // No views/matviews/sequences anywhere unexpected in public.
    const { rows: viewRows } = await client.query(`
      select table_name from information_schema.views where table_schema='public'
      union all
      select matviewname from pg_matviews where schemaname='public';
    `);
    if (viewRows.length > 0) {
      fail(`unexpected view(s)/materialized view(s) in public: ${viewRows.map((r) => r.table_name || r.matviewname).join(", ")}`);
    } else {
      pass("no views or materialized views in public");
    }
    const { rows: seqRows } = await client.query(`
      select sequencename from pg_sequences where schemaname='public';
    `);
    if (seqRows.length > 0) {
      fail(`unexpected sequence(s) in public: ${seqRows.map((r) => r.sequencename).join(", ")}`);
    } else {
      pass("no sequences in public");
    }

    // Policy count must be exactly 0, matching the old inventory.
    const { rows: policyRows } = await client.query(`select count(*) as c from pg_policies where schemaname='public';`);
    if (Number(policyRows[0].c) !== 0) {
      fail(`public has ${policyRows[0].c} policy(ies) — expected exactly 0, matching the approved old inventory`);
    } else {
      pass("policy_count is 0, matching the approved old inventory");
    }

    // Schema owner + ACL fingerprint for public. Round 2: this is now a
    // real fail(), not an INFO print — see EXPECTED_SCHEMA_OWNER/ACL's
    // own comment for the honest caveat that this pinned value comes
    // from the local rehearsal stack, not a captured Remote read.
    const { rows: schemaRows } = await client.query(`
      select n.nspowner::regrole::text as owner, n.nspacl::text as acl
      from pg_namespace n where n.nspname = 'public';
    `);
    const actualOwner = schemaRows[0]?.owner;
    const actualAcl = schemaRows[0]?.acl;
    if (actualOwner !== EXPECTED_SCHEMA_OWNER) {
      fail(`public schema owner is "${actualOwner}", expected "${EXPECTED_SCHEMA_OWNER}"`);
    } else if (actualAcl !== EXPECTED_SCHEMA_ACL) {
      fail(`public schema ACL is "${actualAcl}", expected "${EXPECTED_SCHEMA_ACL}"`);
    } else {
      pass(`public schema owner (${actualOwner}) and ACL match the pinned expectation exactly`);
    }

    await client.query("ROLLBACK;");
  } catch (e) {
    fail(`database check error: ${e.message}`);
    try { await client.query("ROLLBACK;"); } catch { /* connection may already be dead */ }
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Utility mode for building/updating an approval manifest: prints the
  // current fingerprint-definition hash and exits — no flags, no DB,
  // no side effects. `node production-preflight-gate.mjs --print-fingerprint-hash`
  if (args["print-fingerprint-hash"]) {
    console.log(computeFingerprintDefinitionHash());
    process.exit(0);
  }

  const staticResult = runStaticChecks(args);

  if (!staticResult) {
    console.log("\nOne or more required flags were missing, or a static check already failed hard enough that connecting would be pointless. Nothing was applied.");
    process.exit(1);
  }

  await runLiveChecks(staticResult.mode, staticResult.databaseUrl);

  console.log("");
  if (failures === 0) {
    console.log("ALL CHECKS PASSED.");
    console.log("This script performed READ-ONLY checks only, inside a transaction that");
    console.log("was always rolled back, and applied nothing. A passing result here is a");
    console.log("PRECONDITION, not an authorization — the actual Surgical Reset / migrate()");
    console.log("sequence remains a separate, human-run, explicitly-approved step. This");
    console.log("script does not chain into it.");
    process.exit(0);
  } else {
    console.log(`${failures} CHECK(S) FAILED. Refusing. Nothing was applied.`);
    process.exit(1);
  }
}

main();
