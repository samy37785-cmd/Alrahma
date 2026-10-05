#!/usr/bin/env node
// SUPER_ADMIN_SAFETY_GATE: the approval manifest with its bootstrap
// allowlist -- candidate, signing, and every way verifyApprovalManifest()
// refuses a manifest (wrong scope, expired, edited allowlist, unknown
// field, an email or secret inside, a wildcard or a count instead of rows).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TARGET_SUPABASE_REF, computeConfirmToken, verifyApprovalManifest } from './production-approval.mjs';
import { bootstrapAllowlistSha256, validateBootstrapAllowlist } from './bootstrap-allowlist.mjs';
import { buildManifestCandidate, confirmationPhrase, describeCandidate, signManifestCandidate } from './bootstrap-manifest.mjs';
import { exampleBootstrapAllowlist, signedTestManifest } from './manifest-test-fixture.mjs';
import { loadAndVerifyProductionAuthorization } from './production-authorization.mjs';

const GIT = 'a'.repeat(40);
const BACKUP = 'b'.repeat(64);
const ADMIN = '11111111-2222-4333-8444-555555555555';
const fp = (seed) => `sha256:${crypto.createHash('sha256').update(seed).digest('hex')}`;
const withAdmin = () => ({
  ...exampleBootstrapAllowlist(),
  superAdmin: { userId: ADMIN, authUserFingerprint: fp('u'), profileFingerprint: fp('p'), roleAssignmentFingerprint: fp('r') },
  auditRows: [{ id: '99999999-8888-4777-8666-555555555555', action: 'create_plan_version', fingerprint: fp('a') }],
});
const verify = (m, opts = {}) => verifyApprovalManifest(m, { gitSha: GIT, backupHash: BACKUP, ...opts });
// Re-seals a hand-edited manifest so only the property under test is wrong.
const reseal = (m) => ({ ...m, bootstrapAllowlistSha256: bootstrapAllowlistSha256(m.bootstrapAllowlist), confirmToken: computeConfirmToken({ ...m, bootstrapAllowlistSha256: bootstrapAllowlistSha256(m.bootstrapAllowlist) }) });

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

test('a candidate authorizes nothing: scope, backup, expiry, approver and token are all unset', () => {
  const c = buildManifestCandidate({ gitSha: GIT, bootstrapAllowlist: withAdmin() });
  for (const k of ['scope', 'backupHash', 'expiresAt', 'approvedBy', 'approvedAt', 'confirmToken']) assert.equal(c[k], null, k);
  assert.throws(() => verify(c), /missing required field/);
  assert.equal(c.projectRef, TARGET_SUPABASE_REF);
});

test('a manifest signed with the real signing code verifies, for its scope', () => {
  assert.equal(verify(signedTestManifest({ gitSha: GIT, backupHash: BACKUP, bootstrapAllowlist: withAdmin() })), true);
  assert.equal(verify(signedTestManifest({ gitSha: GIT, backupHash: BACKUP, scope: 'plan' }), { requiredScope: 'plan' }), true);
});

test('a plan-scope manifest never authorizes execute; an execute manifest also allows plan', () => {
  const plan = signedTestManifest({ gitSha: GIT, backupHash: BACKUP, scope: 'plan' });
  assert.throws(() => verify(plan, { requiredScope: 'execute' }), /only authorizes read-only plan runs/);
  assert.throws(() => verify(plan), /only authorizes read-only plan runs/, 'the default required scope is execute');
  assert.equal(verify(signedTestManifest({ gitSha: GIT, backupHash: BACKUP }), { requiredScope: 'plan' }), true);
});

test('an expired manifest is refused; so is one valid for longer than 7 days', () => {
  const old = signedTestManifest({ gitSha: GIT, backupHash: BACKUP, validHours: 1, now: new Date(Date.now() - 2 * 3_600_000) });
  assert.throws(() => verify(old), /expired at/);
  assert.throws(() => signedTestManifest({ gitSha: GIT, backupHash: BACKUP, validHours: 24 * 8 }), /validHours must be between/);
  const m = signedTestManifest({ gitSha: GIT, backupHash: BACKUP });
  const long = reseal({ ...m, expiresAt: new Date(Date.parse(m.approvedAt) + 9 * 24 * 3_600_000).toISOString() });
  long.confirmToken = computeConfirmToken(long);
  assert.throws(() => verify(long), /valid for more than 168h/);
});

test('git SHA or backup mismatch is refused (unchanged rules)', () => {
  const m = signedTestManifest({ gitSha: GIT, backupHash: BACKUP });
  assert.throws(() => verify(m, { gitSha: 'c'.repeat(40) }), /was approved for git SHA/);
  assert.throws(() => verify(m, { backupHash: 'd'.repeat(64) }), /backupHash does not match/);
});

test('editing the allowlist after signing is caught: by its sha256, and by the token if the sha256 is updated too', () => {
  const m = signedTestManifest({ gitSha: GIT, backupHash: BACKUP, bootstrapAllowlist: withAdmin() });
  const edited = structuredClone(m);
  edited.bootstrapAllowlist.superAdmin.userId = '22222222-2222-4333-8444-555555555555';
  assert.throws(() => verify(edited), /bootstrapAllowlistSha256 does not match/);
  edited.bootstrapAllowlistSha256 = bootstrapAllowlistSha256(edited.bootstrapAllowlist);
  assert.throws(() => verify(edited), /confirmToken does not match/);
  const scopeSwap = { ...signedTestManifest({ gitSha: GIT, backupHash: BACKUP, scope: 'plan' }), scope: 'execute' };
  assert.throws(() => verify(scopeSwap), /confirmToken does not match/, 'a plan manifest cannot be relabelled execute');
});

test('an unknown field, or any missing field, is refused', () => {
  const m = signedTestManifest({ gitSha: GIT, backupHash: BACKUP });
  assert.throws(() => verify({ ...m, note: 'x' }), /unknown field\(s\): note/);
  for (const k of ['scope', 'expiresAt', 'bootstrapAllowlist', 'bootstrapAllowlistSha256']) {
    const { [k]: _dropped, ...rest } = m;
    assert.throws(() => verify(rest), /missing required field/, k);
  }
});

test('no email or secret may sit anywhere in a manifest', () => {
  const candidate = buildManifestCandidate({ gitSha: GIT, bootstrapAllowlist: exampleBootstrapAllowlist() });
  assert.throws(
    () => signManifestCandidate(candidate, { scope: 'execute', backupHash: BACKUP, approvedBy: 'owner@example.org', validHours: 1 }),
    /approvedBy must be a name/,
  );
  const m = signedTestManifest({ gitSha: GIT, backupHash: BACKUP });
  const withEmail = { ...m, approvedBy: 'owner@example.org' };
  withEmail.confirmToken = computeConfirmToken(withEmail);
  assert.throws(() => verify(withEmail), /contains an email address/);
  const withSecret = { ...m, approvedBy: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' };
  assert.throws(() => verify(withSecret), /contains a JWT/);
  const withUrl = { ...m, approvedBy: 'postgresql://u:p@host/db' };
  assert.throws(() => verify(withUrl), /contains (a connection string|an email address)/);
});

test('allowlist shape: no wildcard, no count, no extra key, no duplicate, only bootstrap actions, real UUIDs', () => {
  const ok = withAdmin();
  assert.equal(validateBootstrapAllowlist(ok), true);
  const bad = [
    (a) => { a.superAdmin.userId = '*'; },
    (a) => { a.auditRows = '*'; },
    (a) => { a.auditRowCount = 3; },
    (a) => { a.auditRows.push({ id: a.auditRows[0].id, action: 'create_plan_version', fingerprint: fp('x') }); },
    (a) => { a.auditRows[0].action = 'admin.role.set'; },
    (a) => { a.plans.pop(); },
    (a) => { a.plans[0].slug = 'Gold'; },
    (a) => { a.plans[0].fingerprint = 'abc'; },
    (a) => { a.superAdmin.extra = true; },
    (a) => { a.superAdmin = null; },
  ];
  for (const mutate of bad) {
    const a = structuredClone(ok);
    mutate(a);
    assert.throws(() => validateBootstrapAllowlist(a), /bootstrapAllowlist:/, mutate.toString());
  }
});

test('describeCandidate and the confirmation phrase carry UUIDs, slugs and actions only', () => {
  const c = buildManifestCandidate({ gitSha: GIT, bootstrapAllowlist: withAdmin() });
  const text = JSON.stringify(describeCandidate(c));
  assert.doesNotMatch(text, /@/);
  assert.match(text, new RegExp(ADMIN));
  assert.equal(confirmationPhrase(c, 'plan'), `APPROVE plan ${c.bootstrapAllowlistSha256.slice(0, 12)}`);
});

test('signing refuses a candidate that was edited after collection or is already signed', () => {
  const c = buildManifestCandidate({ gitSha: GIT, bootstrapAllowlist: withAdmin() });
  const edited = structuredClone(c);
  edited.bootstrapAllowlist.plans[0].fingerprint = fp('other');
  assert.throws(() => signManifestCandidate(edited, { scope: 'plan', backupHash: BACKUP, approvedBy: 'Owner', validHours: 1 }), /edited after collection/);
  const signed = signManifestCandidate(c, { scope: 'plan', backupHash: BACKUP, approvedBy: 'Owner', validHours: 1 });
  assert.throws(() => signManifestCandidate(signed, { scope: 'execute', backupHash: BACKUP, approvedBy: 'Owner', validHours: 1 }), /already has/);
});

test('production authorization: a plan-scope manifest is refused for an execute run and accepted for a plan run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-auth-'));
  const manifestPath = path.join(dir, 'approval.json');
  fs.writeFileSync(manifestPath, JSON.stringify(signedTestManifest({ gitSha: GIT, backupHash: BACKUP, scope: 'plan', bootstrapAllowlist: withAdmin() })));
  const opts = (requestedScope) => ({
    env: { MIGRATION_PRODUCTION_MODE: '1', MIGRATION_APPROVAL_MANIFEST: manifestPath, MIGRATION_BACKUP_MANIFEST: '/fake', SUPABASE_URL: `https://${TARGET_SUPABASE_REF}.supabase.co` },
    verifyFreshBackupFn: () => ({ sha256: BACKUP, ageHours: 1 }),
    currentGitShaFn: () => GIT,
    ...(requestedScope ? { requestedScope } : {}),
  });
  try {
    assert.throws(() => loadAndVerifyProductionAuthorization(opts('execute')), /only authorizes read-only plan runs/);
    assert.throws(() => loadAndVerifyProductionAuthorization(opts()), /only authorizes read-only plan runs/, 'omitted scope = execute');
    const auth = loadAndVerifyProductionAuthorization(opts('plan'));
    assert.equal(auth.scope, 'plan');
    assert.equal(auth.bootstrapAllowlist.superAdmin.userId, ADMIN);
    assert.match(auth.approvalManifestSha256, /^[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
