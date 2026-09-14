// Supabase Auth (GoTrue) clients — used only for credential
// verification/creation, never for data access (that goes through
// client.js's RLS-impersonating `pg` pool). Passwords are Supabase Auth's
// responsibility (auth.users, managed internally), not something this
// backend ever hashes or compares itself under DATA_BACKEND=supabase.
import { createClient } from '@supabase/supabase-js';

let adminClient;
let anonClient;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required when DATA_BACKEND=supabase`);
  return v;
}

// Service-role client: server-side only, never sent to the browser. Used to
// create accounts (auth.admin.createUser) and to send password-reset emails
// on demand. Holding this key is exactly as sensitive as MONGO_URI/
// JWT_SECRET — it must never appear in logs or client-facing responses.
export function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

// Anon-key client: used only to call signInWithPassword, i.e. to ask GoTrue
// "is this email/password combination correct?". The session it returns is
// discarded immediately after reading the resulting user id — this backend
// mints and cookies its own JWT (same contract as the Mongo path), it does
// not persist or forward the Supabase session itself.
export function getAnonClient() {
  if (!anonClient) {
    anonClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

// A brand-new anon-key client per call, never the shared getAnonClient()
// singleton. Only used for the password-recovery bridge (resetPassword),
// which must call setSession() with a per-request, per-user recovery
// session — doing that on the shared singleton would let one request's
// in-memory session bleed into a concurrent request's calls on the same
// client instance (the same shared-client hazard this codebase has
// eliminated everywhere else for `pg` clients). Cheap to construct: no
// socket/connection is opened until a request is made.
export function createScopedAnonClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Review follow-up (auth hardening batch): admin_rt (the refresh-token
// cookie) used to be Path-scoped to /api/v1/admin/auth/refresh only — on a
// real, Path-respecting browser it was NEVER sent on a request to
// /api/v1/admin/auth/logout (it is now widened to the whole /auth subtree,
// see utils/adminAuthTokens.js's refreshCookieOptions). This Supabase
// backend's logout() DOES read and use admin_rt now — as a fallback
// credential, exchanged via exchangeRefreshTokenForAccessToken() below for a
// fresh access token purely to revoke with, when admin_sat (the primary
// credential) is missing or GoTrue rejects it — see logout()'s own comment
// for the full flow. (An earlier version of this comment claimed the
// opposite — that this backend "never reads it there" — which was true only
// of a since-fixed, never-actually-reachable code path; it no longer
// describes the current logout() at all.) Historically,
// adminAuthController.js's logout() called
// client.auth.refreshSession({ refresh_token: rawRefresh }) using
// req.cookies[REFRESH_TOKEN_COOKIE] as `rawRefresh` — code that was
// correct in isolation (and fixed a real shared-client hazard, see that
// file's own history) but sat behind a condition (`if (rawRefresh)`) that
// a real browser could never satisfy at the old, narrower path, so it
// never actually ran in production: GoTrue sessions were never revoked on
// admin logout at all, identical in effect to the Mongo-mode bug already
// found and fixed in controllers/adminAuthController.js's logout().
//
// The fix is to revoke using data that DOES arrive at /logout: admin_sat
// (the raw GoTrue access token, Path=/api/v1/admin — covers the whole
// admin API tree). GoTrue's REST /auth/v1/logout endpoint only requires a
// valid access token in the Authorization header; there is no supabase-js
// client method for this that doesn't also demand a refresh token up
// front (client.auth.signOut() only acts on a session established via
// setSession()/refreshSession(), both of which require one), so this
// calls the REST endpoint directly instead of going through a supabase-js
// client instance.
//
// `scope=global` (the only scope this codebase ever passes) revokes every
// refresh-token session GoTrue has for this user, on every device — not
// just the one this request came from — matching the same "logging out
// everywhere is safer" policy controllers/adminAuthController.js's Mongo-
// mode logout() already applies to its own RefreshToken family. It does
// NOT invalidate the admin_sat access-token JWT that was ALREADY handed to
// this browser: like any stateless JWT, that token remains cryptographically
// valid to anyone holding it until its own `exp` claim passes (the
// SUPABASE_AT_COOKIE's maxAge — 15 minutes, supabaseSessionCookie.js's
// supabaseAtCookieOptions()). Revocation here only prevents that session
// from ever being *refreshed* again once it expires; it cannot retroactively
// kill an access token already in flight. This is standard, expected JWT
// behavior (GoTrue keeps no access-token blocklist), not a bug in this
// call — callers must not assume "revoked" means "immediately unusable."
//
// Review follow-up: the caller used to silently discard whether this
// actually succeeded. Returns a result object (not a bare boolean) so
// logout() can log and audit a genuine upstream failure (GoTrue
// unreachable, timed out, or a non-2xx response — e.g. an already-invalid
// token, a misconfigured SUPABASE_ANON_KEY, a GoTrue outage) as an
// observable event, while still always clearing this app's own cookies
// locally regardless — an admin must never be stuck "logged in" in their
// own browser just because the upstream revocation call failed.
const DEFAULT_REVOKE_TIMEOUT_MS = 5000;

// Read fresh on every call (not cached at module load) purely so tests can
// override it via process.env right before calling logout() end-to-end,
// without needing to change logout()'s own call site or thread a timeout
// value all the way through it. Production always gets
// DEFAULT_REVOKE_TIMEOUT_MS unless this env var is deliberately set.
function resolveTimeoutMs(explicitMs) {
  if (Number.isFinite(explicitMs) && explicitMs > 0) return explicitMs;
  const fromEnv = Number(process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_REVOKE_TIMEOUT_MS;
}

// Review follow-up: an unreachable/hanging GoTrue host used to be able to
// hang this call (and therefore the whole logout request) indefinitely —
// fetch() has no built-in timeout. A bounded, AbortController-driven
// timeout closes that: the request is aborted after `timeoutMs`
// (resolveTimeoutMs() above), and an abort is treated as just another
// upstream-revocation failure (reason: 'timeout') — never an uncaught
// rejection, never a hang. logout() (adminAuthController.js) already
// treats every failure reason identically: cookies are cleared locally and
// the response carries `upstreamRevocationFailed: true` regardless of
// which reason fired.
export async function revokeGoTrueSession(accessToken, scope = 'global', { timeoutMs } = {}) {
  if (!accessToken) return { ok: false, reason: 'no_access_token' };
  const base = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const effectiveTimeoutMs = resolveTimeoutMs(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    const res = await fetch(`${base}/auth/v1/logout?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: requireEnv('SUPABASE_ANON_KEY'),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: 'non_2xx_response', status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', timeoutMs: effectiveTimeoutMs };
    }
    // A real network failure (GoTrue unreachable, DNS, ...) — still
    // surfaced to the caller for logging/auditing, not swallowed.
    return { ok: false, reason: 'network_error', message: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// GoTrue's own explicit signal that a refresh token is dead (expired,
// already rotated/reused, or itself already revoked) — the ONLY condition
// under which exchangeRefreshTokenForAccessToken() below reports
// 'refresh_token_invalid'. Deliberately narrow: GoTrue has used both an
// older `{ error, error_description }` shape and a newer
// `{ error_code, msg }` shape across versions for this exact case, so both
// are checked, but nothing else is inferred as "invalid" from status code
// alone — a bare HTTP 400/401 with an unrecognized body (a misconfigured
// project, a GoTrue-side bug, a proxy's own error page) must NOT be treated
// as "token invalid, nothing to revoke"; it is a real, unclassified failure
// (see the 'non_2xx_response' branch below) precisely so logout() never
// mistakes "we don't understand what GoTrue said" for "there is nothing left
// to do".
const INVALID_REFRESH_TOKEN_ERROR_CODES = new Set([
  'invalid_grant',
  'refresh_token_not_found',
  'refresh_token_already_used',
]);

function isExplicitInvalidRefreshTokenResponse(status, body) {
  if (status !== 400 && status !== 401) return false;
  const code = body?.error_code ?? body?.error ?? body?.code;
  if (typeof code === 'string' && INVALID_REFRESH_TOKEN_ERROR_CODES.has(code)) return true;
  const description = String(body?.error_description ?? body?.msg ?? '');
  return /invalid refresh token/i.test(description);
}

// Review follow-up: logout()'s admin_rt fallback used to call
// createScopedAnonClient().auth.refreshSession({ refresh_token }) directly —
// two real bugs, fixed together here:
//
//   1. No timeout at all. fetch() (which refreshSession() calls internally)
//      never times out on its own; an unreachable/hanging GoTrue host could
//      hang the ENTIRE logout request indefinitely, exactly the hazard
//      revokeGoTrueSession() above already closed for the admin_sat path —
//      the admin_rt fallback path was never given the same protection. This
//      calls GoTrue's REST token endpoint directly (bypassing supabase-js
//      entirely) specifically so a real, non-Promise.race,
//      AbortController-driven timeout (resolveTimeoutMs() above — same
//      ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS setting revokeGoTrueSession() reads)
//      can actually cancel the in-flight network request when it fires, not
//      just abandon a still-running promise while pretending to move on.
//
//   2. Every possible refreshSession() failure (network error, timeout,
//      GoTrue 5xx, an unexpected/malformed response) used to be treated as
//      proof the refresh token was "already invalid" — a real failure to
//      revoke was silently reported as full success. Only GoTrue's own
//      EXPLICIT confirmation that this specific refresh token is dead
//      (isExplicitInvalidRefreshTokenResponse() above) may be read that way;
//      every other failure mode is returned as its own distinct `reason` so
//      logout() can correctly mark upstreamRevocationFailed: true instead of
//      papering over a real outage.
//
// Returns { ok: true, accessToken } on success, or
// { ok: false, reason, status?, message? } — `reason` is one of
// 'no_refresh_token' | 'refresh_token_invalid' | 'non_2xx_response' |
// 'unexpected_response' | 'timeout' | 'network_error'. The access token this
// returns is used by the caller ONLY to feed straight into
// revokeGoTrueSession() — it is never cookied back to the client (a client
// that asked to log out must never receive a freshly-live session in the
// same response that claims to have ended it; see logout()'s own comment).
export async function exchangeRefreshTokenForAccessToken(refreshToken, { timeoutMs } = {}) {
  if (!refreshToken) return { ok: false, reason: 'no_refresh_token' };
  const base = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const effectiveTimeoutMs = resolveTimeoutMs(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: requireEnv('SUPABASE_ANON_KEY'),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null; // a non-JSON body is handled by the branches below, not thrown past this function
    }

    if (!res.ok) {
      if (isExplicitInvalidRefreshTokenResponse(res.status, body)) {
        return { ok: false, reason: 'refresh_token_invalid', status: res.status, message: body?.error_description ?? body?.msg ?? null };
      }
      return { ok: false, reason: 'non_2xx_response', status: res.status, message: body?.error_description ?? body?.msg ?? null };
    }

    if (!body?.access_token) {
      // A 2xx with no access_token is not a shape GoTrue's real token
      // endpoint produces — treat it as an unexpected failure, not a quiet
      // success, rather than pass `undefined` on to revokeGoTrueSession().
      return { ok: false, reason: 'unexpected_response', status: res.status, message: 'GoTrue token response missing access_token' };
    }

    return { ok: true, accessToken: body.access_token };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', timeoutMs: effectiveTimeoutMs };
    }
    return { ok: false, reason: 'network_error', message: err.message };
  } finally {
    clearTimeout(timer);
  }
}
