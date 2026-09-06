// Fixes a real bug found while running scripts/production-readonly-
// ownership-audit.mjs against the real project for the first time
// (Stage 2D "Final Live Read-Only Production Readiness Gate" task):
// every production-connecting tool in this codebase requires
// `sslmode=require` (or stricter) to be present in the connection
// string's query string, then ALSO passes an explicit
// `ssl: {rejectUnauthorized: true, ca}` to `pg.Client` for Supabase's
// project-specific CA. Those two don't compose the way they look like
// they should: pg-connection-string's current version treats
// `sslmode=require`/`verify-ca` as aliases for `verify-full` and
// constructs its OWN ssl settings from the URL, which silently
// override the explicit `ssl` object — the connection then tries to
// verify Supabase's CA against Node's PUBLIC trust store and fails
// with "self-signed certificate in certificate chain", even though a
// correct `ca` was supplied. Confirmed by actually connecting to the
// real project both ways: with `sslmode=require` in the URL it fails;
// with the exact same URL minus that one query parameter (and the same
// explicit `ssl` object) it succeeds.
//
// The fix: keep validating that the CALLER's URL declares a strict
// sslmode (real intent — reject a plaintext/weak URL up front), but
// strip the literal query parameter before the connection is actually
// opened, so the explicit `ssl` object is the only thing governing
// verification.
export function connectionStringForClient(databaseUrl) {
  const u = new URL(databaseUrl);
  u.searchParams.delete("sslmode");
  return u.toString();
}
