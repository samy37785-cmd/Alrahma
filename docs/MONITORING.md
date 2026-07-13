# Monitoring & Observability — Al-Rahma Academy

## Logging

### Backend (Winston)

Logs are emitted by the Winston logger at `backend/config/logger.js`.

| Environment | Output | Level |
|-------------|--------|-------|
| development | Console (colorised) | debug |
| production | Console + rotating files in `backend/logs/` | info |
| test | Silent | — |

**Log files (production only):**
- `logs/app-YYYY-MM-DD.log` — all info+ events, rotated daily
- `logs/error-YYYY-MM-DD.log` — error-level only
- `logs/exceptions-YYYY-MM-DD.log` — uncaught exceptions
- `logs/rejections-YYYY-MM-DD.log` — unhandled promise rejections

Uncaught exceptions and unhandled rejections are also always printed to
Console in production, not just written to the files above — Render (the
deployment target) has no persistent disk configured, so those files don't
survive a restart/redeploy and Console is the only durable channel (Render's
log viewer streams stdout/stderr).

Files are compressed after rotation and retained for **14 days** (max 20 MB/file).

### Request Logging

Every HTTP request is logged after the response is sent with:
```json
{ "level": "info", "message": "GET /api/courses", "status": 200, "ms": 42, "userId": "..." }
```
4xx responses log at `warn`, 5xx at `error`.

## Error Tracking (Sentry)

Frontend errors are captured by `@sentry/react` when `VITE_SENTRY_DSN` is set.
Sentry's own global handlers catch uncaught errors/rejections automatically;
in addition, the top-level `ErrorBoundary` component explicitly calls
`captureException` on every React render error it catches, since a caught
error boundary error is exactly what prevents Sentry's automatic handlers
from ever seeing it.

- Traces sample rate: 20% (configurable via DSN dashboard)
- Session replays: 5% normal, 100% on error
- Errors ignored: ResizeObserver, AbortError, generic network failures

To enable, set `VITE_SENTRY_DSN` in Vercel Environment Variables.

## Health & Readiness Checks

`GET /health` — liveness probe, always fast, no DB check. Returns:
```json
{
  "status": "ok",
  "uptime": 3600,
  "memory": 52428800,
  "version": "1.0.0",
  "env": "production",
  "ts": "2025-01-01T09:00:00.000Z"
}
```

`GET /ready` — readiness probe. Checks both `connectDB()` and
`mongoose.connection.readyState`, so it correctly reports `503` if MongoDB
disconnects at runtime, not just before the first successful connect.
Returns `{ "status": "ready" }` (200) or `{ "status": "not ready", "reason": "database" }` (503).

Use `/health` with any uptime monitoring service (UptimeRobot, Better Uptime, etc.) — check every 5 minutes.

## Alerts to Configure

| Alert | Trigger | Action |
|-------|---------|--------|
| Health check down | `/health` returns non-200 for 2+ consecutive checks | PagerDuty / email |
| Error rate spike | Sentry error rate > 10/min | Investigate `logs/error-*` |
| Memory > 400 MB | `health.memory` > 419430400 | Restart the Render service |
| Cron job missed | No email sent by 10:00 UTC | Check the external scheduler's run log (UptimeRobot/GitHub Actions — there is no Vercel Cron; see `CLAUDE.md` Deployment section) |

## Backup Strategy

MongoDB Atlas provides:
- **Continuous backup** (dedicated clusters) or **daily snapshots** (M0)
- Point-in-time restore for 7 days (dedicated)

Manual export:
```bash
mongodump --uri="$MONGO_URI" --out=./backup/$(date +%F)
```

## Google Analytics

Set `VITE_GA_ID` to your GA4 Measurement ID (`G-XXXXXXXXXX`) in Vercel environment variables. The Analytics component in `frontend/src/components/ui/Analytics.jsx` handles page view tracking automatically on route changes.
