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

Files are compressed after rotation and retained for **14 days** (max 20 MB/file).

### Request Logging

Every HTTP request is logged after the response is sent with:
```json
{ "level": "info", "message": "GET /api/courses", "status": 200, "ms": 42, "userId": "..." }
```
4xx responses log at `warn`, 5xx at `error`.

## Error Tracking (Sentry)

Frontend errors are captured by `@sentry/react` when `VITE_SENTRY_DSN` is set.

- Traces sample rate: 20% (configurable via DSN dashboard)
- Session replays: 5% normal, 100% on error
- Errors ignored: ResizeObserver, AbortError, generic network failures

To enable, set `VITE_SENTRY_DSN` in Vercel Environment Variables.

## Health Check

`GET /health` returns:
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

Use this endpoint with any uptime monitoring service (UptimeRobot, Better Uptime, etc.) — check every 5 minutes.

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
