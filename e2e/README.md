# E2E smoke + visual-baseline suite

Phase 0 safety net of the refactoring roadmap. Runs the **real app**: the
actual Express backend (`backend/scripts/e2eServer.js`) against an in-memory
MongoDB replica set (same helper the backend test suite uses), plus the
production Vite build served by `vite preview`. Real CSRF, real auth cookies,
real rate limiting.

**Port isolation:** the suite runs on its own ports — backend `:5100`,
frontend preview `:4300` (proxying `/api` there via `PREVIEW_API_TARGET`) —
deliberately distinct from the dev backend (`:5000`), dev server (`:5173`)
and manual preview (`:4173`), with `reuseExistingServer: false`, so it can
never silently run against a developer's live backend/database (that exact
incident is why: an early run reused a dev backend on :5000 and the seeded
login "mysteriously" failed).

Nothing app-level is mocked except:

- `/_vercel/insights/script.js` (Vercel Analytics) — only exists when hosted
  on Vercel; stubbed with an empty script in `support/helpers.mjs`.
- Service workers are blocked (`playwright.config.js`) so requests stay
  interceptable and caching stays deterministic.
- The Quran reader's verse content comes from the external quran.com API —
  specs assert only the app-owned shell and mask the content area in
  screenshots, so a third-party outage can't fail the suite.

## Commands (repo root)

```bash
npm run e2e          # build frontend + run suite
npm run e2e:quick    # run against the existing frontend/dist build
npm run e2e:update   # regenerate screenshot baselines after an intended visual change
```

## Screenshot baselines

Committed under `e2e/__screenshots__/{desktop,mobile}/`. They are rendered on
the dev machine; **CI skips screenshot comparisons** (`ignoreSnapshots` when
`CI` is set) because Linux font rendering can never match them pixel-for-pixel
— CI runs the functional assertions only. When a refactor intends a visual
change, eyeball the diff (`playwright-report/`) and re-run `npm run e2e:update`.

## Determinism notes

- `reducedMotion: 'reduce'` is emulated context-wide; the site's CSS and
  `useCountUp` both honor it, freezing reveal/count animations.
- The dashboard spec pins the clock (`page.clock.install`) because the
  greeting and date labels depend on wall-clock time.
- Specs run with `workers: 1` — they share one seeded backend and its rate
  limiters (`/api/auth/*` allows 20 requests/15min per IP; each login flow
  spends one).

## Seeded data

`backend/scripts/e2eServer.js` seeds one student account (credentials in
`support/helpers.mjs`). Add seeds there when a new spec needs data — keep it
minimal and deterministic.
