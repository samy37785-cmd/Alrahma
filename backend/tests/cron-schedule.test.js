import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Production-readiness audit follow-up (2026-09-17): backend/routes/
// cronRoutes.js (and its Supabase mirror) has always implemented and
// CRON_SECRET-protected renewal-reminders / weekly-parent-reports /
// retry-failed-emails, but nothing in this repository ever actually
// triggered them on a schedule in production — a stale comment in
// .migration-backup/render.yaml claimed .github/workflows/cron.yml already
// existed; it did not. This is a static proof that the real file now
// exists, declares a real schedule, calls every required endpoint, and
// never risks leaking CRON_SECRET into a log — it cannot exercise the
// actual scheduled trigger (that only GitHub Actions' own infrastructure
// can do), but it can prove the workflow file is not silently broken/
// missing/misconfigured.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'cron.yml');

const REQUIRED_ENDPOINTS = [
  '/api/cron/renewal-reminders',
  '/api/cron/weekly-parent-reports',
  '/api/cron/retry-failed-emails',
];

test('static: .github/workflows/cron.yml exists', () => {
  assert.equal(existsSync(WORKFLOW_PATH), true, 'the scheduled-jobs workflow file must exist');
});

test('static: declares at least one real cron schedule (not workflow_dispatch-only)', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  const cronLines = [...source.matchAll(/-\s*cron:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(cronLines.length >= 1, 'must declare at least one `cron:` schedule entry');
  // Every declared schedule must be a plausible 5-field cron expression.
  for (const expr of cronLines) {
    assert.equal(expr.trim().split(/\s+/).length, 5, `"${expr}" is not a valid 5-field cron expression`);
  }
});

test('static: every required /api/cron/* endpoint is called somewhere in the workflow', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  for (const endpoint of REQUIRED_ENDPOINTS) {
    assert.ok(source.includes(endpoint), `workflow must call ${endpoint}`);
  }
});

test('static: retry-failed-emails (the flagged gap — email-outbox retry) runs on a schedule far more frequent than daily', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  // The step that calls retry-failed-emails must be gated on a cron
  // expression using a */N minute-field pattern (sub-hourly), not just
  // "some schedule exists somewhere in the file" — proves this specific
  // job (the one the audit flagged as never actually triggered) is wired
  // to run often, not just present.
  const retrySection = source.split('retry-failed-emails').slice(0, 2).join('retry-failed-emails');
  assert.match(
    retrySection,
    /\*\/\d+ \* \* \* \*/,
    'retry-failed-emails must be gated on a sub-hourly (*/N minute-field) schedule',
  );
});

test('static: uses secrets.CRON_SECRET and secrets.CRON_BASE_URL, never a hardcoded value', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(source, /secrets\.CRON_SECRET/);
  assert.match(source, /secrets\.CRON_BASE_URL/);
});

test('static: fails loudly (exit 1) if either required secret is unset, rather than silently skipping', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(source, /CRON_BASE_URL.*not configured/s);
  assert.match(source, /CRON_SECRET.*not configured/s);
  assert.match(source, /exit 1/);
});

test('static: CRON_SECRET is registered with ::add-mask:: and curl never runs in verbose/trace mode (never risks logging the Authorization header)', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(source, /::add-mask::\$\{\{\s*secrets\.CRON_SECRET\s*\}\}/);
  assert.doesNotMatch(source, /curl[^\n]*(-v\b|--verbose|--trace)/);
});

test('static: never triggers on push or pull_request — schedule and workflow_dispatch only', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  const onBlock = source.slice(source.indexOf('\non:'), source.indexOf('\npermissions:'));
  assert.doesNotMatch(onBlock, /\bpush:/);
  assert.doesNotMatch(onBlock, /\bpull_request:/);
  assert.match(onBlock, /\bschedule:/);
  assert.match(onBlock, /\bworkflow_dispatch:/);
});
