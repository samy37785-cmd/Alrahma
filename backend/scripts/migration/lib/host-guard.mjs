// Stage 2J-B — Production Enablement.
//
// Replaces every plain, unconditional `assertLocalHost()` used by the two
// worker scripts (mongo-to-supabase.mjs, migrate-users-to-supabase-auth.mjs)
// for MIGRATION_DB_URL with a version that can be lifted ONLY when a
// genuine, independently-verified production authorization
// (lib/production-authorization.mjs's loadAndVerifyProductionAuthorization())
// is presented — never a bare boolean, never a caller-supplied string.
//
// MIGRATION_MONGO_URI is deliberately NOT covered by this module at all:
// every stage of this engagement's own operating plan requires the Mongo
// SOURCE to always be a local, disposable, restored-from-backup copy —
// never the real Atlas cluster directly — so that guard stays exactly the
// unconditional `assertLocalHost()` it always was, in both worker scripts,
// completely untouched by this change.
export function isLocalHost(uri) {
  const host = new URL(uri).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * @param {string} uri
 * @param {string} label - for the error message only (e.g. "MIGRATION_DB_URL")
 * @param {{verified: true, projectRef: string} | null} productionAuthorization -
 *   must be the exact, already-verified object
 *   loadAndVerifyProductionAuthorization() returns — never a bare
 *   `{verified: true}` a caller could fabricate without ever having
 *   actually run the real checks that object's own creator performs.
 */
export function assertLocalHostOrProductionAuthorized(uri, label, productionAuthorization) {
  const host = new URL(uri).hostname;
  if (isLocalHost(uri)) return;

  if (!productionAuthorization) {
    throw new Error(
      `Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1, and no production authorization was ` +
      'provided (set MIGRATION_PRODUCTION_MODE=1 with a valid, fresh approval manifest and backup manifest to lift ' +
      'this guard for a genuinely reviewed, approved production run).'
    );
  }
  // productionAuthorization must be the real, already-verified object --
  // this is a defense-in-depth structural check, not the actual
  // verification itself (that already happened, or threw, inside
  // loadAndVerifyProductionAuthorization()). A caller passing anything
  // else (a plain `true`, an unrelated object) is refused here too.
  if (productionAuthorization.verified !== true || typeof productionAuthorization.projectRef !== 'string') {
    throw new Error(
      `Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1, and the supplied production ` +
      'authorization object is not a genuinely verified result — pass the exact return value of ' +
      'loadAndVerifyProductionAuthorization(), never a fabricated object.'
    );
  }
}
