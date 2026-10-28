# Public Form Proxy Signing — Runbook

## Why this exists

Every `/api/*` call to `al-rahmaacademy.com` reaches Render through Vercel's external rewrite (`vercel.json`). Render therefore sees **Vercel's outbound address** as `req.ip`, and all visitors in a region share one rate-limit budget.

This was checked on 2026-10-28 with GET requests only:
- `GET /api/csrf` through the domain counted down one shared bucket.
- A direct Render call counted in a separate, fresh one.

The trial and booking limiters were meant per visitor. Instead, a burst of visitors (or one abuser) could use up the budget for everyone.

Widening Express's `trust proxy` would let anyone calling the raw `*.onrender.com` host forge `X-Forwarded-For`, so it is not an option. Instead, the two public form endpoints go through small Vercel Functions that sign the visitor's real IP. This is the same scheme as the admin proxy (`docs/admin-proxy-signing-runbook.md`), with its own headers and its own secret.

## Flow

```
Browser → al-rahmaacademy.com/api/trials            (or /api/enrollments)
        → vercel.json exact-literal rewrite, listed before the general one:
              "/api/trials"      -> "/api/v1/trials-proxy"
              "/api/enrollments" -> "/api/v1/enrollments-proxy"
        → Vercel Function (api/_lib/publicFormProxy.mjs)
              - fixed target path; the request's query string is dropped
              - client IP = first entry of Vercel's edge-set x-forwarded-for
              - HMAC-SHA256 over { method, path, '', clientIp, timestamp,
                bodyHash } with PUBLIC_PROXY_SIGNING_SECRET
                (no secret = forwarded unsigned, exactly like before)
        → academy-backend-cxso.onrender.com/api/trials
              - middleware/publicProxySignature.js verifies; only a valid
                signature sets req.trustedClientIp
              - config/rateLimit.js keys every limiter on
                req.trustedClientIp || req.ip
```

Every other path is unchanged and keeps the general rewrite. That includes `/api/enrollments/mine`, `/api/auth/*` and `/api/csrf`.

The general rule is left byte-identical and does **not** exclude the two form paths. Rule order alone sends them to the Functions, because the first matching rule wins. If an exact-literal rule ever stopped matching, a form request would still reach Render the old way, unsigned, rather than get a 404 and lose a lead.

A failed check never blocks a request. A forged signature, a stale one (more than 120 s old), a body changed after signing, a signature for another path or with another secret: in every case the request keys on `req.ip` as before. Render logs a reason code, never the IP, signature, body or secret. When the secret is unset, nothing is logged.

## Owner steps (once)

The secret is never shared with anyone, including Claude.

1. **Generate one new value** on your own computer. Do not reuse `ADMIN_PROXY_SIGNING_SECRET`.
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Render** → service `academy-backend` → Environment → add `PUBLIC_PROXY_SIGNING_SECRET` = that value → Save. Then **Manual Deploy** of the merge commit, if it isn't deployed yet.
3. **Vercel** → Project → Settings → Environment Variables → add `PUBLIC_PROXY_SIGNING_SECRET` = the same value, **Production**. Then **Redeploy** the current Production deployment, because a new variable only applies to new deployments.

Either order is safe:
- Render without Vercel: nothing is signed yet.
- Vercel without Render: signatures are ignored ("secret unavailable", not logged).

Until both are set, the limiters behave exactly as before this change.

## Verify (GET only, no form is sent)

`GET /api/trials` through the domain now goes through the Function, gets signed, and is charged to the **visitor's own** address by the general `/api` limiter before the route answers 404.

So after both steps:
1. `curl -sI https://al-rahmaacademy.com/api/trials` and note `RateLimit-Remaining`.
2. `curl -sI https://academy-backend-cxso.onrender.com/api/csrf`: a **direct** call, keyed on your own IP. It must show the next number down (the same bucket).
3. `curl -sI https://al-rahmaacademy.com/api/csrf` (general rewrite, Vercel's address) counts in a **different** bucket.

If step 2 does not continue the count from step 1, signing is not active. Check that the two values match exactly and that both services were redeployed after the variable was added.
