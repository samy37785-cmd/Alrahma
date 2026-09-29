# ADMIN_ENCRYPTION_KEY rotation runbook

Operational order for rotating `ADMIN_ENCRYPTION_KEY` in the future, without
breaking existing encrypted `AdminUser._mfaSecret` / `_mfaPendingSecret`
values in Mongo. No secrets or real values are recorded in this document —
fill in the actual key values yourself, in your own secret manager, when
you actually perform a rotation.

This runbook describes a **future, separately-authorized operation**. None
of the steps below have been executed as part of the change that added
this file or the tooling it references.

## Prerequisites

- `backend/config/encryption.js` already supports dual-key `decrypt()`
  (tries `ADMIN_ENCRYPTION_KEY` first, falls back to
  `ADMIN_ENCRYPTION_KEY_PREVIOUS` only on AES-GCM verification failure).
- `backend/scripts/ops/rotate-admin-mfa-encryption.mjs` (this tool) is
  deployed.

## Procedure

1. **Deploy the dual-key code first, with no key change yet.** Ship the
   `ADMIN_ENCRYPTION_KEY_PREVIOUS`-aware `decrypt()` to Production with
   `ADMIN_ENCRYPTION_KEY_PREVIOUS` still unset. Behavior is unchanged
   (single key, same as always) — this step exists only to get the
   fallback-capable code live *before* anything about the actual key
   changes, so step 2 is never a race between "new code" and "new key."

2. **Manually update Render's environment (later, separate step).**
   Generate a new key:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   In Render → `academy-backend` → Environment:
   - Move the *current* `ADMIN_ENCRYPTION_KEY` value into
     `ADMIN_ENCRYPTION_KEY_PREVIOUS`.
   - Set `ADMIN_ENCRYPTION_KEY` to the newly generated value.
   Deploy. At this point `decrypt()` transparently serves both old and new
   ciphertext; `encrypt()` (all *new* writes) already uses only the new key.

3. **Dry-run.** From an environment with read access to the real Mongo and
   both key values set (but `ALLOW_ADMIN_MFA_KEY_ROTATION` **not** set):
   ```
   node backend/scripts/ops/rotate-admin-mfa-encryption.mjs
   ```
   Review the printed counts (`recordsClean` / `recordsRotatable` /
   `recordsFailed`). Investigate any `recordsFailed` > 0 before proceeding —
   it means at least one field on that record didn't decrypt under either
   key (forged, corrupt, or an even older key than what you have on hand).

4. **Apply, inside a maintenance window.** Only once the dry-run counts
   look right:
   ```
   ALLOW_ADMIN_MFA_KEY_ROTATION=1 \
     node backend/scripts/ops/rotate-admin-mfa-encryption.mjs --apply --confirm-rotation
   ```
   This re-encrypts every `recordsRotatable` record's fields under the
   current key only, one atomic update per record. Records already current,
   or with any unreadable field, are left untouched. Re-run the dry-run
   command afterward — a clean rotation shows `recordsRotatable: 0` and
   `recordsFailed` equal to whatever it was before (never higher).

5. **Test MFA with a real test account.** Log in as a non-production admin
   test account with MFA enabled and confirm TOTP still verifies correctly
   — proof the rotation didn't silently corrupt a live secret the dry-run
   happened not to catch.

6. **Remove the previous key, later.** Once step 4 shows `recordsRotatable:
   0` and you've confirmed step 5, and enough time has passed that you're
   confident no other lingering process depends on the old key, remove
   `ADMIN_ENCRYPTION_KEY_PREVIOUS` from Render entirely and deploy. From
   this point, `decrypt()` behaves as a single-key system again until the
   next rotation.

## Notes

- `--apply` always requires **both** `--confirm-rotation` (CLI) and
  `ALLOW_ADMIN_MFA_KEY_ROTATION=1` (env) — two independent, explicit
  acknowledgements, neither sufficient alone.
- The tool only ever reads/writes `AdminUser._mfaSecret` and
  `_mfaPendingSecret`. It never touches `mfaEnabled`, `role`, or any other
  field, on any model.
- The tool is safe to re-run at any point — a record already on the
  current key is never rewritten, and a record with an unreadable field is
  never touched (only counted).
