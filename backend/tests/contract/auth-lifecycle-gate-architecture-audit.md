# Supabase Auth Lifecycle — Architecture Audit (Phase A)

Written before any test/harness code (per this gate's own Phase A instructions).
Every row below is read directly from the current code, not assumed.

## Routing

`backend/app.js:236`: `app.use('/api/auth', authLimiter, isSupabaseBackend() ? supabaseAuthRoutes : authRoutes);`

Under `DATA_BACKEND=supabase`, `/api/auth` mounts `data/supabase/routes/authRoutes.js` →
`data/supabase/authController.js` — a real, distinct adapter implementation, **not**
a fallback onto the Mongo controller. Confirmed: there is no code path under
which `DATA_BACKEND=supabase` silently uses Mongo for `/api/auth`.

## Endpoint table

| Endpoint | Backend selected (DATA_BACKEND=supabase) | Token type accepted by middleware | External dependency | Locally testable (Docker Postgres only)? |
|---|---|---|---|---|
| `POST /api/auth/register` (malformed/missing body) | `data/supabase/authController.js`'s `register` | n/a (no session issued) | **None** — `registerValidation` (express-validator) runs first; on failure `handleValidationErrors` returns before any Supabase Auth call | **Yes** |
| `POST /api/auth/register` (well-formed, valid/duplicate) | same | issues this app's own custom cookie JWT (`utils/authCookie.js`'s `signToken`, `HS256`, secret = `JWT_SECRET`) on success | **GoTrue HTTP** — calls `admin.auth.admin.createUser()` via `@supabase/supabase-js`'s `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` (`authClients.js`'s `getAdminClient()`), a real network call to `${SUPABASE_URL}/auth/v1/...`. Duplicate-email detection (`error.status === 422`) is GoTrue's own decision, not app/Postgres logic | **No — `BLOCKED_EXTERNAL_DEPENDENCY`** (no GoTrue server exists in a bare `postgres:16` container) |
| `POST /api/auth/login` (malformed/missing body) | `login` | n/a | **None** — `loginValidation` runs first, same short-circuit | **Yes** |
| `POST /api/auth/login` (well-formed, correct/wrong password) | same | this app's own custom cookie JWT on success | **GoTrue HTTP** — `anon.auth.signInWithPassword()` via `getAnonClient()`, real network call. The session GoTrue returns is discarded immediately; this backend mints its own JWT (`sendAuth`) | **No — `BLOCKED_EXTERNAL_DEPENDENCY`** |
| `GET /api/auth/me` | `getMe`, behind `protect` | **This app's own custom cookie JWT only** — `middleware/auth.js`'s `_loadUser()` does `jwt.verify(token, process.env.JWT_SECRET, {algorithms:['HS256']})`, never a Supabase Auth token | **None** — `loadUserById()` (`data/supabase/loadUser.js`) is pure `pg`/RLS via `withUserContext`, no GoTrue call | **Yes** |
| `POST /api/auth/logout` | `logout` | n/a | **None** — `res.clearCookie(AUTH_COOKIE, ...)` only; no DB query, no GoTrue call at all | **Yes** |
| `PUT /api/auth/me` (name only) | `updateMe` | custom cookie JWT (`protect`) | **None** for the name-only path (`update_own_profile_name()` RPC, pure Postgres) | Not exercised by this gate (not in the requested scope; noted for completeness) |
| `PUT /api/auth/me` (password/email change) | `updateMe` | custom cookie JWT | **GoTrue HTTP** — re-verifies the current password via `signInWithPassword`, applies changes via `admin.updateUserById()` | Not exercised (out of this gate's requested scope) |
| `POST /api/auth/forgot-password` | `forgotPassword` | n/a | **GoTrue HTTP + real SMTP** — `anon.auth.resetPasswordForEmail()` sends an actual email via the Supabase project's configured mail provider | **No — `BLOCKED_EXTERNAL_DEPENDENCY`** |
| `POST /api/auth/reset-password` | `resetPassword` | a GoTrue-issued `token_hash` (`type: recovery`), verified via `scoped.auth.verifyOtp()` | **GoTrue HTTP** — the `token_hash` can only ever be minted by a real GoTrue recovery-email flow; there is no local way to obtain one | **No — `BLOCKED_EXTERNAL_DEPENDENCY`** |
| `POST /api/auth/google` | `googleAuth` | n/a (needs a real Google ID token) | **GoTrue HTTP + real Google OAuth** — `anon.auth.signInWithIdToken({provider:'google', ...})` | **No — `BLOCKED_EXTERNAL_DEPENDENCY`** |
| `GET /api/auth/link-code` | `getLinkCode`, behind `protect` | custom cookie JWT | **None** — `ensure_parent_link_code()` RPC, pure Postgres | Not exercised (out of this gate's requested scope) |

## What this means for Phase C

- **Testable locally, no live Supabase/SMTP/Google needed at all**: register/login
  *validation-boundary* behavior (malformed body → 422, no row created — the
  shared `handleValidationErrors()` status, confirmed by running it, not assumed), the full
  `GET /api/auth/me` auth guard + user-isolation contract, and `POST /api/auth/logout`.
- **`BLOCKED_EXTERNAL_DEPENDENCY`, not called, not simulated, not substituted with the
  Staging project**: a *successful* register, a *duplicate* register, a login with a
  correct or an incorrect password, forgot-password, reset-password, and Google
  sign-in. All five require a real GoTrue HTTP server (and, for forgot-password,
  a real outbound email) that a disposable `postgres:16` container structurally
  cannot provide. This is an architectural fact about how this codebase implements
  account credentials under `DATA_BACKEND=supabase` (Supabase Auth/GoTrue owns
  password storage and verification entirely — confirmed by `profiles` having no
  password column at all, see the direct-DB proof in the gate itself), not a defect,
  not a missing endpoint, and not something a Staging-project substitution would be
  appropriate for under this task's explicit constraints.

## Logout / invalidation — documented as-is, nothing invented

`logout` only clears the `token` cookie client-side. There is no server-side
session/token revocation for `DATA_BACKEND=supabase` accounts: `loadUser.js`'s own
module comment states `tokenVersion` has no Postgres column under this backend, so
`protect()`'s tokenVersion check always trivially passes (`(decoded.v ?? 0) !== (user.tokenVersion ?? 0)`
compares `0 !== 0`). A previously-issued JWT therefore remains valid until its
natural expiry even after logout. This is an existing, documented architectural
property of the codebase, not something introduced or fixed by this gate.
