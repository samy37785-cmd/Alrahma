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
        → vercel.json rewrite: "/api/v1/admin/:path*" -> "/api/v1/admin-proxy"
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

Every other `/api/*` route is untouched — the dedicated admin rewrite is
evaluated before the general `/api/:path*` -> Render rewrite, and the
general rewrite's own negative-lookahead exclusion of `v1/admin` is kept
as a second, defensive layer, so it keeps serving every other path exactly
as before.

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
is now a plain, non-dynamic Function, reached through an explicit
`vercel.json` rewrite (`"/api/v1/admin/:path*" -> "/api/v1/admin-proxy"`,
Vercel's own documented syntax for proxying deep paths — see
https://vercel.com/docs/routing/rewrites). Per Vercel's documented
behavior for a rewrite whose destination has no `:path` placeholder of its
own (the same shape as their `/resize/:width/:height` -> `/api/sharp`
example, which becomes `/api/sharp?width=800&height=600`), the captured
segments are flattened onto the destination's query string instead of its
path. `resolveAdminProxyRequest()` (`api/_lib/resolveAdminProxyRequest.mjs`)
undoes that flattening before anything else in the function runs, so the
HMAC signing, Render destination URL, and all forwarded headers are
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
   the admin rewrite rule or `api/v1/admin-proxy.mjs` entirely is **not**
   a safe rollback on its own — without the dedicated rewrite, admin
   traffic falls through to the general `/api/:path*` -> Render rewrite,
   which the general rewrite's own `v1/admin` exclusion deliberately keeps
   from ever happening (see "Multi-segment routing fix" above); that
   exclusion must be removed too if the dedicated admin path is ever
   actually retired. Render's `adminProxySignature.js` no-ops harmlessly
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
