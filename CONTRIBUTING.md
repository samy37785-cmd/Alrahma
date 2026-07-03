# Contributing to Al-Rahma Academy

## Getting Started

```bash
# 1. Clone and install
git clone <repo-url>
npm run setup        # installs frontend + backend deps

# 2. Configure environment
cp backend/.env.example backend/.env
# Fill in: MONGO_URI, JWT_SECRET, EMAIL_*, STRIPE_*, PAYPAL_*

# 3. Start dev servers
npm run dev          # runs frontend (5173) + backend (5000) concurrently
```

## Code Style

- **No hardcoded strings** — all UI text goes in `frontend/src/i18n/`
- **No magic numbers** — extract to named constants
- **No `console.log`** in backend code — use `logger` from `config/logger.js`
- **Error handling** — wrap async route handlers with `asyncHandler`
- **Validation** — use `express-validator` for all user input
- **Follow existing patterns** — new controllers look like existing controllers

## Branch Strategy

```
main          ← production (protected)
feature/*     ← new features
fix/*         ← bug fixes
chore/*       ← tooling, deps, docs
```

## Adding a New Feature

### Backend

1. Create the Mongoose model in `backend/models/`
2. Create the controller in `backend/controllers/` using `asyncHandler`
3. Add `express-validator` validation inline or in a `*Validation` array
4. Create the route file in `backend/routes/`
5. Register the route in `backend/app.js`
6. Add tests in `backend/tests/`

### Frontend

1. Add API helpers to `frontend/src/api/client.js`
2. Create a React Query hook in `frontend/src/hooks/`
3. Add i18n keys to all 6 language files in `frontend/src/i18n/`
4. Add dark mode CSS for any new classes in `frontend/src/styles/dark.css`
5. Add tests in `frontend/src/test/`

## Running Tests

```bash
# All tests
npm test

# Backend only (Node built-in test runner)
npm run test:backend

# Frontend only (Vitest)
npm run test:frontend

# Frontend with coverage
npm run test:coverage
```

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `MONGO_URI` | backend | MongoDB Atlas connection string |
| `JWT_SECRET` | backend | JWT signing key (32+ chars) |
| `REFRESH_SECRET` | backend | Refresh token signing key |
| `EMAIL_HOST` | backend | SMTP host |
| `EMAIL_USER` | backend | SMTP username |
| `EMAIL_PASS` | backend | SMTP password |
| `EMAIL_FROM` | backend | From address |
| `STRIPE_SECRET_KEY` | backend | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | backend | Stripe webhook signing secret |
| `CLIENT_URL` | backend | Allowed CORS origin(s) |
| `CRON_SECRET` | backend | Cron endpoint auth token |
| `REDIS_URL` | backend | Optional — Redis for rate limiting |
| `VITE_API_URL` | frontend | API base URL (defaults to `/api`) |
| `VITE_SENTRY_DSN` | frontend | Sentry DSN for error tracking |
| `VITE_GA_ID` | frontend | Google Analytics measurement ID |

## Commit Message Format

```
type(scope): short description

feat(notifications): add unread badge to header
fix(auth): handle expired refresh token gracefully
chore(deps): upgrade Winston to 3.19
docs(api): document review endpoints
test(coupon): add isValid business logic tests
```
