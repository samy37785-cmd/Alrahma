#!/usr/bin/env node
// Ops tool: re-encrypts AdminUser._mfaSecret / _mfaPendingSecret from
// ADMIN_ENCRYPTION_KEY_PREVIOUS to ADMIN_ENCRYPTION_KEY, for a deliberate,
// operator-controlled ADMIN_ENCRYPTION_KEY rotation window (see
// backend/config/encryption.js's dual-key decrypt() support). These are
// the ONLY two encrypted fields on AdminUser — no other model, no role,
// no mfaEnabled flag, no other AdminUser field is ever read or written by
// this tool.
//
// NOT run against any real database as part of the task that added this
// file — see docs/admin-encryption-key-rotation-runbook.md for the full,
// separately-authorized operational procedure this tool is meant to run
// under (maintenance window, dry-run first, etc).
//
// Usage:
//   node rotate-admin-mfa-encryption.mjs                       (dry-run, default)
//   node rotate-admin-mfa-encryption.mjs --dry-run
//   node rotate-admin-mfa-encryption.mjs --apply --confirm-rotation
//
// --dry-run (default): read-only. Classifies every MFA field (already
// current / would rotate / unreadable) and prints ONLY counts — never
// IDs, emails, secrets, or ciphertext. Writes nothing.
//
// --apply requires ALL of the following, or it refuses to run:
//   - --confirm-rotation passed explicitly alongside --apply (a second,
//     independent acknowledgement — --apply alone is never enough).
//   - ALLOW_ADMIN_MFA_KEY_ROTATION=1 set in the environment (a dedicated
//     authorization variable separate from any other env var).
//   - ADMIN_ENCRYPTION_KEY and ADMIN_ENCRYPTION_KEY_PREVIOUS both set to a
//     valid 64-hex-character key (checked BEFORE any Mongo connection).
//
// Every record is processed atomically: one Mongo updateOne per record,
// touching only the field(s) that actually changed. A record with any
// unreadable field is skipped in full (see the core module's own header
// for why) and only counted as a failure, never written. The tool is safe
// to re-run: a clean re-run after a successful apply finds nothing left to
// rotate (everything already decrypts under the current key).
import 'dotenv/config';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { parseStrictCliArgs } from '../migration/lib/cli-args.mjs';
import { planRotation, applyRotation, isValidHexKey } from './lib/rotate-admin-mfa-encryption-core.mjs';
import { encrypt } from '../../config/encryption.js';
import AdminUser from '../../models/AdminUser.js';

export const CLI_SPEC = {
  flags: {
    apply:              { type: 'boolean' },
    'dry-run':          { type: 'boolean' },
    'confirm-rotation': { type: 'boolean' },
  },
};

export function validateCliArgs(args) {
  if (args.apply && args['dry-run']) {
    throw new Error('--apply and --dry-run cannot be combined — pass one or the other (default is dry-run).');
  }
  if (args['confirm-rotation'] && !args.apply) {
    throw new Error('--confirm-rotation only has meaning together with --apply.');
  }
  if (args.apply && !args['confirm-rotation']) {
    throw new Error(
      '--apply requires --confirm-rotation as a second, explicit, independent acknowledgement — ' +
      '--apply alone is never sufficient to perform a real rotation.'
    );
  }
}

// Pure pre-flight resolver: given parsed CLI args and an env-like object,
// either returns the fully-validated run configuration or throws — no I/O,
// no Mongo, no side effect, so this exact gate (the whole of section 4's
// --apply protection) is directly unit-testable with plain objects, never
// a real environment or database.
export function resolveRunConfig({ args, env }) {
  validateCliArgs(args);
  const apply = !!args.apply;

  const mongoUri = env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is not set.');

  const currentKeyHex = env.ADMIN_ENCRYPTION_KEY;
  if (!isValidHexKey(currentKeyHex)) {
    throw new Error('ADMIN_ENCRYPTION_KEY must be set to a valid 64-hex-character key.');
  }
  const previousKeyHexRaw = env.ADMIN_ENCRYPTION_KEY_PREVIOUS || null;

  if (apply) {
    if (env.ALLOW_ADMIN_MFA_KEY_ROTATION !== '1') {
      throw new Error(
        '--apply refuses to run: ALLOW_ADMIN_MFA_KEY_ROTATION=1 must be set as an explicit, ' +
        'dedicated authorization for this run.'
      );
    }
    if (!isValidHexKey(previousKeyHexRaw)) {
      throw new Error(
        '--apply refuses to run: ADMIN_ENCRYPTION_KEY_PREVIOUS must be set to a valid ' +
        '64-hex-character key (both the current and previous key are required to apply a rotation).'
      );
    }
  }
  // Dry-run never requires the previous key — absent/invalid, it simply
  // reports every non-current field as 'unreadable' at this point in time,
  // the same graceful degradation encrypt.js's own decrypt() already has.
  const previousKeyHex = isValidHexKey(previousKeyHexRaw) ? previousKeyHexRaw : null;

  return { apply, mongoUri, currentKeyHex, previousKeyHex };
}

async function main() {
  const args = parseStrictCliArgs(process.argv.slice(2), CLI_SPEC);
  const { apply, mongoUri, currentKeyHex, previousKeyHex } = resolveRunConfig({ args, env: process.env });

  console.log(`[rotate-admin-mfa] mode=${apply ? 'apply' : 'dry-run'}`);

  await mongoose.connect(mongoUri);
  try {
    const docs = await AdminUser.find({
      $or: [{ _mfaSecret: { $ne: null } }, { _mfaPendingSecret: { $ne: null } }],
    })
      .select('_id _mfaSecret _mfaPendingSecret')
      .lean();

    const candidates = docs.map((d) => ({
      id: d._id,
      _mfaSecret: d._mfaSecret,
      _mfaPendingSecret: d._mfaPendingSecret,
    }));

    const { counts, recordPlans } = planRotation(candidates, { currentKeyHex, previousKeyHex });
    console.log('[rotate-admin-mfa] scan:', JSON.stringify(counts));

    if (!apply) {
      console.log('[rotate-admin-mfa] dry-run only — no writes performed.');
      return;
    }

    const result = await applyRotation(recordPlans, {
      encryptFn: encrypt,
      writeFn: async (id, patch) => {
        await AdminUser.updateOne({ _id: id }, { $set: patch });
      },
    });
    console.log('[rotate-admin-mfa] apply:', JSON.stringify(result));
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[rotate-admin-mfa] FATAL:', err.message);
    process.exitCode = 1;
  });
}
