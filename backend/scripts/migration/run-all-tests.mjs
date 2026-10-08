#!/usr/bin/env node
// PR #70 review round 7, item 8 -- a single, explicit entrypoint for
// EVERY migration test file in this directory, run in one process with a
// clear aggregate pass/fail summary. Backing for `npm run test:migration`
// (backend/package.json). Deliberately separate from the plain `npm test`
// glob (`node --test tests/**/*.test.js`), which only ever matches
// `.test.js` files under backend/tests/ -- every file this script runs is
// a `.test.mjs` file under backend/scripts/migration/, a structurally
// disjoint set. `npm test` passing has never meant, and still does not
// mean, "the migration tests ran" -- this script is the only thing that
// runs them, and must be invoked explicitly (`npm run test:migration` or
// `npm run test:all`).
//
// Each file below already manages its own disposable Docker
// Mongo/Postgres/GoTrue-stub containers and verifies their own cleanup;
// this script only sequences them and aggregates the final exit code.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite } from './lib/test-summary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Order matters only in that pure/unit-only files (fast, no Docker) run
// first, so a quick regression is visible before the slower, disposable-
// infrastructure-backed files even start.
const TEST_FILES = [
  'lib/cli-args.test.mjs',
  'lib/composite-target-id.test.mjs',
  'lib/markreconciled-coverage.test.mjs',
  'lib/reconcile.test.mjs',
  'lib/production-authorization.test.mjs',
  'lib/host-guard.test.mjs',
  'lib/enrollments-transform.test.mjs',
  'lib/disposable-supabase-stack.test.mjs',
  'lib/source-dates.test.mjs',
  'lib/redact.test.mjs',
  'lib/auth-import.test.mjs',
  'lib/no-service-identity.test.mjs',
  'lib/email-collision.test.mjs',
  'lib/bootstrap-manifest.test.mjs',
  'lib/security-ephemeral.test.mjs',
  'lib/source-collections.test.mjs',
  'lib/test-summary.test.mjs',
  'mongo-to-supabase-cli.test.mjs',
  'migrate-users-to-supabase-auth.test.mjs',
  'unrecorded-data-preflight.test.mjs',
  'schema-forward-0028-0029.test.mjs',
  'orchestrator-cli-resume-compensate.test.mjs',
  'production-import-orchestrator.test.mjs',
  'production-enablement-cli.test.mjs',
  'resume-rollback-integrity.test.mjs',
  'lossless-import.test.mjs',
  'bootstrap-allowlist.test.mjs',
  'super-admin-email-collision.test.mjs',
  // Real, disposable Supabase-CLI stack (real Postgres + real GoTrue +
  // Kong) -- deliberately last: by far the slowest file here (a full
  // multi-container stack start/stop), so every fast/cheap file's own
  // regression is visible first.
  'real-gotrue-correlation.test.mjs',
  // The owner-run Super Admin operator tools (scripts/ops/), end to end on
  // their own real Supabase stack with the Mailpit mail catcher.
  '../ops/operator-tools.real-gotrue.test.mjs',
  // The first-Super-Admin recovery tool (an invite that expired unused), on its own real stack.
  '../ops/recover-first-super-admin.real-gotrue.test.mjs',
];

// A file passes only when it exits 0, prints its "<passed>/<total> passed."
// line, ran at least one test and passed all of them (lib/test-summary.mjs).
const { ok } = await runSuite(TEST_FILES.map((rel) => path.join(__dirname, rel)), {
  display: (file) => path.relative(__dirname, file).split(path.sep).join('/'),
});
if (!ok) process.exitCode = 1;
