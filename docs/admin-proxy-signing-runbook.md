# Admin Proxy Signing — Runbook

## Why this exists

`/api/v1/admin/*` is reached through the same Vercel external rewrite as
every other `/api/*` route (`vercel.json`): `al-rahmaacademy.com/api/*` →
Vercel edge → a new outbound connection to
`academy-backend-cxso.onrender.com`. That extra hop hides the real browser
client IP behind Vercel's own outbound edge IP by the time it reaches
Render, which is why `ADMIN_IP_WHITELIST` cannot reliably match a real
admin's IP today (see the "Admin IP Allowlist Proxy-Path Diagnosis" audit).

Widening Express's `trust proxy` to `2` would "fix" that, but it also lets
anyone hitting Render's raw `*.onrender.com` hostname directly forge
`X-Forwarded-For` and impersonate any IP — a real spoofing hole. This
feature avoids that trade-off entirely: `trust proxy` stays at `1`, and a
dedicated Vercel Function (the only thing allowed to add the headers below)
cryptographically signs the real client IP before forwarding to Render.

## Flow

```
Browser → al-rahmaacademy.com/api/v1/admin/*
        → vercel.json rewrites:
              "/api/v1/admin" -> "/api/v1/admin-proxy"                     (bare case)
              "/api/v1/admin/:subpath(.*)" -> "/api/v1/admin-proxy?path=:subpath"
        → Vercel Function (api/v1/admin-proxy.mjs)
              - resolveAdminProxyRequest() (api/_lib/) reconstructs the
                real /api/v1/admin/... path + query string from the
                rewrite-flattened request (see "Multi-segment routing fix"
                below)
              - reads the real client IP from Vercel's own edge-set
                x-forwarded-for (trusted: this function IS the hop
                facing the browser)
              - HMAC-signs { method, path, clientIp, timestamp, bodyHash }
                with ADMIN_PROXY_SIGNING_SECRET (skipped entirely if unset)
        → academy-backend-cxso.onrender.com/api/v1/admin/*
              - adminProxySignature.js verifies the signature; only on
                success does ipWhitelist.js trust the signed IP over req.ip
```

Every other `/api/*` route is untouched — the dedicated admin rewrites are
evaluated before the general rewrite
(`/api/:path((?!v1/admin(?:$|/)).*)` -> `https://academy-backend-cxso.onrender.com/api/:path`),
and that rewrite's own negative-lookahead exclusion of `v1/admin` (the
`(?!v1/admin(?:$|/))` part of its source — not a path starting with
`/api/v1/admin/`) is kept as a second, defensive layer, so it keeps
serving every other path exactly as before.

## Multi-segment routing fix (this file's current form)

The admin proxy originally lived at `api/v1/admin/[...path].mjs`, relying
on Vercel's zero-config catch-all file-naming convention to match every
depth under `/api/v1/admin/*`. In production that convention only matched
requests with exactly **one** path segment after the prefix —
`/api/v1/admin/enrollments` reached the function, but
`/api/v1/admin/auth/login` (two segments — the actual admin login
endpoint) got a platform-level 404 from Vercel's edge before the function
ever ran, silently breaking admin login while every single-segment admin
route kept working. Zero Vercel Function invocations and zero Render
application-log entries were recorded for any multi-segment admin path,
confirming the request never left Vercel's edge.

The fix stops relying on that zero-config convention. `api/v1/admin-proxy.mjs`
is now a plain, non-dynamic Function. Three rewrite forms were tried, in
this order, each verified live against a real Preview deployment before
moving to the next:

1. Vercel's *named catch-all parameter* syntax
   (`"/api/v1/admin/:path*" -> "/api/v1/admin-proxy"`) — documented,
   intended for exactly this ("proxying deep paths"). Reproduced the
   **exact same** one-segment-only limitation this fix exists for.
2. A *bare, anchored regex capture group*
   (`"^/api/v1/admin(/.*|)$" -> "/api/v1/admin-proxy?path=$1"`, the same
   shape as Vercel's own `/articles/(\d{4})/(\d{2})/(.+)` ->
   `/archive?year=$1&month=$2&slug=$3` example — see
   https://vercel.com/docs/routing/rewrites). Matched **nothing at all**
   on Vercel's actual edge — not even the previously-working one-segment
   case — despite matching correctly as plain JS `RegExp` locally. Vercel's
   edge regex matching is evidently not plain JS `RegExp` and doesn't
   accept this construct, even in its simplified non-alternating form
   (`"^/api/v1/admin/(.*)$"`), which also failed the same way.
3. **The working fix**: the one syntax form already proven correct for
   multi-segment matching in this exact project — a *named parameter with
   an attached custom regex group*, the same family the general Render
   rewrite above already uses and has used successfully for arbitrarily
   deep non-admin paths all along (`"/api/v1/admin/:path((?!v1/admin(?:$|/)).*)"`,
   whose own `.*` custom regex is proof this family handles multiple
   segments on this platform). Two rules: an exact-literal rule for the
   bare `/api/v1/admin` case, and
   `"/api/v1/admin/:subpath(.*)" -> "/api/v1/admin-proxy?path=:subpath"`
   for everything with a subpath.

Confirmed live for all 6 required admin paths plus the bare root case.
One further empirical finding while verifying: the resulting request this
function receives carries the captured value under **two** query keys,
not one — `path` (the literal text in the destination) *and* `subpath`
(Vercel auto-appends every named capture under its own parameter name as
well, regardless of whether it's also referenced elsewhere in the
destination — observed directly in Render's own request logs). Both are
stripped before anything else uses the query string.
`resolveAdminProxyRequest()` (`api/_lib/resolveAdminProxyRequest.mjs`)
does this reconstruction before anything else in the function runs, so
the HMAC signing, Render destination URL, and all forwarded headers are
constructed exactly as before this fix — nothing downstream of that one
reconstruction step changed.

## Fail-closed behavior (all of these leave `ipWhitelist` reading plain `req.ip`, unchanged from today)

- `ADMIN_PROXY_SIGNING_SECRET` unset on Vercel → the function adds no
  signed headers at all (plain pass-through).
- `ADMIN_PROXY_SIGNING_SECRET` unset on Render → the verifier reports
  `secret_unavailable` for any request, signed or not.
- Timestamp outside a ~30s window, method/path/body/IP mismatch, or a
  forged/garbled signature → `signature_mismatch` / `timestamp_out_of_range`.
- A forged `x-admin-proxy-ip` header sent directly to Render (bypassing
  Vercel entirely) is never useful on its own — without a signature that
  verifies against the current secret, it is ignored.

## Deployment order (do NOT run these now — this PR is code-only)

1. Generate one secret value (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   and set it as `ADMIN_PROXY_SIGNING_SECRET` — the SAME value — in both
   Vercel's project environment variables and Render's `academy-backend`
   environment variables. Never commit this value anywhere.
2. Deploy this code (Vercel picks up the new Function automatically on the
   next deploy; deploy Render's `academy-backend` separately).
3. Test an admin action from an IP already present in
   `ADMIN_IP_WHITELIST` — confirm it now succeeds through the normal
   `al-rahmaacademy.com` admin login, not just via direct-to-Render access.
4. Rollback, if needed: remove/unset `ADMIN_PROXY_SIGNING_SECRET` on
   either side (or both) to fall back to today's exact behavior. Removing
   the admin rewrite rules or `api/v1/admin-proxy.mjs` entirely is **not**
   a safe rollback on its own — without the dedicated rewrites, admin
   traffic falls through to the general rewrite
   (`/api/:path((?!v1/admin(?:$|/)).*)` -> Render), whose own negative-lookahead
   exclusion of `v1/admin` deliberately keeps that from ever happening (see
   "Multi-segment routing fix" above); that exclusion must be removed too
   if the dedicated admin path is ever actually retired. Render's `adminProxySignature.js` no-ops harmlessly
   either way (it only ever sets an optional field `ipWhitelist.js` may or
   may not use).

## Explicit statement on spoofing via Render's raw host

Yes, this preserves that protection. `trust proxy` remains `1`, unchanged.
A request sent directly to `academy-backend-cxso.onrender.com` with a
forged `X-Forwarded-For` still cannot influence `req.ip` beyond what it
already could before this feature existed, and any `x-admin-proxy-*`
headers it forges are rejected unless they carry a valid HMAC signature
computed with the current `ADMIN_PROXY_SIGNING_SECRET` — a secret that
request has no way to know.
