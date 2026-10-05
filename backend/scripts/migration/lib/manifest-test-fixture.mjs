// Test support only: a shape-valid bootstrap allowlist, and an approval
// manifest produced by the REAL candidate + signing code
// (lib/bootstrap-manifest.mjs), so every test exercises the exact format
// the owner signs.
import crypto from 'node:crypto';
import { buildManifestCandidate, signManifestCandidate } from './bootstrap-manifest.mjs';
import { CANONICAL_PLANS } from './plan-catalog.mjs';

const fp = (seed) => `sha256:${crypto.createHash('sha256').update(String(seed)).digest('hex')}`;

/** No Super Admin, the three canonical plans with placeholder ids/fingerprints, no audit rows. */
export function exampleBootstrapAllowlist() {
  return {
    schemaVersion: 1,
    superAdmin: null,
    plans: CANONICAL_PLANS.map((p, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, slug: p.slug, fingerprint: fp(p.slug) })),
    auditRows: [],
  };
}

export function signedTestManifest({ gitSha, backupHash, scope = 'execute', bootstrapAllowlist = exampleBootstrapAllowlist(), validHours = 2, now = new Date() }) {
  const candidate = buildManifestCandidate({ gitSha, bootstrapAllowlist });
  return signManifestCandidate(candidate, { scope, backupHash, approvedBy: 'test-operator', validHours, now });
}
