// Regression tests for scripts/production-cutover-orchestrator.mjs's
// Phase 0 (identity + argument validation) — Stage 2I-B1 audit hardening.
//
// Runs the REAL orchestrator script as a child process (not a
// reimplementation of its logic), but ONLY exercises argument shapes
// that must fail INSIDE Phase 0, before the script ever reaches
// Phase 1's runPreflightGate() call — which spawns
// production-preflight-gate.mjs --mode production and WOULD attempt a
// real network connection using CUTOVER_DATABASE_URL. Every case here is
// deliberately crafted to fail closed on a static check first, so this
// test never needs (and never supplies) real production credentials —
// CUTOVER_DATABASE_URL below is a syntactically valid but entirely
// fake/unreachable Supabase-shaped connection string, used only to get
// past the orchestrator's own hostname-shape check.
//
// This specifically covers the Stage 2I-B1 audit finding: --policy-fixture
// used to be optional, silently degrading the one script authorized to
// touch production to a "policies exist (count > 0)" post-migration RLS
// check instead of an Exact Set match. It is now required — these tests
// prove that requirement is actually enforced, not just documented.
//
// Usage: cd ops/option-a-rehearsal && node test/cutover-orchestrator-args.test.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const repoRoot = path.resolve(opsDir, "..", "..");
const orchestratorScript = path.join(opsDir, "scripts", "production-cutover-orchestrator.mjs");
const scratchDir = path.join(opsDir, "out", "cutover-orchestrator-args-test");

// Fake, unreachable, but syntactically valid production-shaped connection
// string — matches PROJECT_REF and the direct-hostname pattern the
// orchestrator's Phase 0 requires, but nothing in this file ever lets a
// case reach the point where that hostname would actually be dialed.
const FAKE_CUTOVER_DATABASE_URL = "postgresql://postgres:fake-unreachable@db.difzynyphojgisrfvrkd.supabase.co:5432/postgres?sslmode=require";
const REAL_CA_CERT_PATH = path.join(opsDir, "fixtures", "test-ca.crt");
const EXPECTED_SIGNUPS_ATTESTATION = "SIGNUPS-DISABLED-CONFIRMED-VIA-DASHBOARD-difzynyphojgisrfvrkd";

function runOrchestrator(extraArgs) {
  const args = [orchestratorScript, ...extraArgs];
  try {
    const out = execFileSync(process.execPath, args, {
      env: { ...process.env, CUTOVER_DATABASE_URL: FAKE_CUTOVER_DATABASE_URL },
      encoding: "utf8",
      cwd: repoRoot,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

// A full set of otherwise-valid-looking flags (nonexistent-but-non-empty
// paths are fine for approval-manifest/dump-file/checksum-file — Phase 0
// never checks their existence itself, only that something was supplied;
// that happens later, inside the child preflight-gate process, which
// these tests are careful never to reach).
function baseArgs(overrides = {}) {
  const args = {
    "approval-manifest": path.join(scratchDir, "fake-approval-manifest.json"),
    "dump-file": path.join(scratchDir, "fake-dump.bin"),
    "checksum-file": path.join(scratchDir, "fake-manifest.json"),
    "ca-cert-file": REAL_CA_CERT_PATH,
    "signups-disabled-attestation": EXPECTED_SIGNUPS_ATTESTATION,
    "policy-fixture": path.join(scratchDir, "fake-policy-fixture.json"),
    ...overrides,
  };
  const out = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue; // allows a case to omit a flag entirely
    out.push(`--${k}`, v);
  }
  return out;
}

async function main() {
  console.log("--- building scratch fixtures");
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(path.join(scratchDir, "fake-dump.bin"), "not a real dump\n");

  // ------------------------------------------------------------------
  // T1: --policy-fixture omitted entirely -> refused with the exact
  // "missing required" message, same as every other required flag.
  // ------------------------------------------------------------------
  console.log("--- T1: missing --policy-fixture is refused");
  const t1 = runOrchestrator(baseArgs({ "policy-fixture": undefined }));
  assert.notEqual(t1.code, 0, "T1: orchestrator must exit nonzero with no --policy-fixture");
  assert.match(t1.out, /ERROR missing required --policy-fixture/, `T1 output:\n${t1.out}`);

  // ------------------------------------------------------------------
  // T2: --policy-fixture points at a file that does not exist.
  // ------------------------------------------------------------------
  console.log("--- T2: --policy-fixture naming a nonexistent file is refused");
  const missingFixturePath = path.join(scratchDir, "does-not-exist.json");
  const t2 = runOrchestrator(baseArgs({ "policy-fixture": missingFixturePath }));
  assert.notEqual(t2.code, 0, "T2: orchestrator must exit nonzero with a nonexistent --policy-fixture");
  assert.match(t2.out, /--policy-fixture ".*does-not-exist\.json" does not exist/, `T2 output:\n${t2.out}`);

  // ------------------------------------------------------------------
  // T3: --policy-fixture exists but is not valid JSON.
  // ------------------------------------------------------------------
  console.log("--- T3: --policy-fixture with invalid JSON is refused");
  const badJsonPath = path.join(scratchDir, "bad-json-policy-fixture.json");
  fs.writeFileSync(badJsonPath, "{ this is not valid json");
  const t3 = runOrchestrator(baseArgs({ "policy-fixture": badJsonPath }));
  assert.notEqual(t3.code, 0, "T3: orchestrator must exit nonzero with malformed JSON in --policy-fixture");
  assert.match(t3.out, /--policy-fixture ".*bad-json-policy-fixture\.json" is not valid JSON/, `T3 output:\n${t3.out}`);

  // ------------------------------------------------------------------
  // T4: --policy-fixture is valid JSON but an empty array — a fixture
  // with nothing in it cannot back an "Exact Set" match (this is the
  // core of the Stage 2I-B1 fix: no fixture => count-only fallback used
  // to be silently accepted; now an empty one is refused too).
  // ------------------------------------------------------------------
  console.log("--- T4: --policy-fixture that is an empty JSON array is refused");
  const emptyArrayPath = path.join(scratchDir, "empty-policy-fixture.json");
  fs.writeFileSync(emptyArrayPath, "[]");
  const t4 = runOrchestrator(baseArgs({ "policy-fixture": emptyArrayPath }));
  assert.notEqual(t4.code, 0, "T4: orchestrator must exit nonzero with an empty --policy-fixture array");
  assert.match(t4.out, /must be a non-empty JSON array of captured policy definitions/, `T4 output:\n${t4.out}`);

  // ------------------------------------------------------------------
  // T5: --policy-fixture is valid JSON but not an array at all.
  // ------------------------------------------------------------------
  console.log("--- T5: --policy-fixture that is not an array is refused");
  const notArrayPath = path.join(scratchDir, "not-array-policy-fixture.json");
  fs.writeFileSync(notArrayPath, JSON.stringify({ tablename: "profiles" }));
  const t5 = runOrchestrator(baseArgs({ "policy-fixture": notArrayPath }));
  assert.notEqual(t5.code, 0, "T5: orchestrator must exit nonzero with a non-array --policy-fixture");
  assert.match(t5.out, /must be a non-empty JSON array of captured policy definitions/, `T5 output:\n${t5.out}`);

  // ------------------------------------------------------------------
  // T6: a genuinely well-formed, non-empty --policy-fixture (the repo's
  // own real fixture) must clear Phase 0's OWN policy-fixture checks
  // (loaded + OK message printed) before failing for an unrelated,
  // EARLIER-in-the-file reason (the fake CUTOVER_DATABASE_URL's
  // confirm-token, computed from the real current git SHA, cannot be
  // known in advance) — proving T1-T5 above fail for the policy-fixture
  // reason specifically, not because every run fails immediately for
  // some other reason regardless of what --policy-fixture says.
  // ------------------------------------------------------------------
  console.log("--- T6: a valid non-empty --policy-fixture is accepted by Phase 0's own checks");
  const realFixturePath = path.join(opsDir, "fixtures", "new-schema-rls-policies.json");
  const t6 = runOrchestrator(baseArgs({ "policy-fixture": realFixturePath, "confirm-token": "deliberately-wrong-token-so-this-stops-before-touching-any-network" }));
  assert.notEqual(t6.code, 0, "T6: still expected to fail overall (wrong confirm-token), just not for the policy-fixture");
  const t6PolicyFixtureFails = t6.out.split("\n").filter((l) => l.startsWith("ERROR") && l.toLowerCase().includes("policy-fixture"));
  assert.deepEqual(t6PolicyFixtureFails, [], `T6: no policy-fixture-related failure expected once a valid fixture is given; output:\n${t6.out}`);
  assert.match(t6.out, /OK    --policy-fixture loaded \(\d+ policy definition\(s\)\)/, `T6 output:\n${t6.out}`);
  assert.match(t6.out, /--confirm-token did not match the required exact literal/, `T6 output:\n${t6.out}`);

  console.log("--- cleaning up scratch fixtures");
  fs.rmSync(scratchDir, { recursive: true, force: true });

  console.log("\nALL cutover-orchestrator-args.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
