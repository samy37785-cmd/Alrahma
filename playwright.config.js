import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * E2E smoke + visual-baseline suite (Phase 0 of the refactoring roadmap).
 *
 * Two purposes, one suite:
 *  - Functional smoke (runs everywhere, incl. CI): the app boots against a
 *    real backend + in-memory MongoDB and the core flows render/work.
 *  - Screenshot baselines (local only): the regression safety net for the
 *    component-decomposition and CSS-consolidation refactor phases.
 *    Baselines are rendered on the dev machine; Linux CI can never match
 *    them pixel-for-pixel, so CI sets ignoreSnapshots and runs the
 *    functional assertions only.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  // One worker: all specs share one seeded backend and its rate limiters.
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  ignoreSnapshots: CI,
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Small tolerance for antialiasing jitter between runs on one machine.
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: 'http://localhost:4300',
    // Deterministic rendering: the app honors prefers-reduced-motion
    // site-wide (global.css) and in useCountUp, so this freezes reveal/count
    // animations that would otherwise race the screenshot.
    contextOptions: { reducedMotion: 'reduce' },
    // The app registers sw.js; requests served through a service worker
    // bypass page.route() interception and make caching non-deterministic
    // between specs — block it for e2e.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // Pixel 5 = Chromium-based mobile emulation (393×851, touch) — matches
      // the ~390px viewport used in prior mobile field testing.
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Ports 5100/4300 are e2e-only, deliberately different from the dev
  // backend (5000), dev server (5173) and manual preview (4173) so the suite
  // can never silently run against a developer's live backend/database.
  // reuseExistingServer is false for the same reason: a port collision must
  // fail loudly, not reuse whatever happens to be listening.
  webServer: [
    {
      // Real Express app + in-memory MongoDB, seeded (backend/scripts/e2eServer.js).
      command: 'node scripts/e2eServer.js',
      cwd: './backend',
      url: 'http://localhost:5100/health',
      reuseExistingServer: false,
      // First run may download the mongod binary (~100MB).
      timeout: 240_000,
      env: {
        E2E_BACKEND_PORT: '5100',
        CLIENT_URL: 'http://localhost:4300',
      },
    },
    {
      // Serves the production build; `npm run e2e` (root) builds first.
      command: 'npm run preview -- --port 4300 --strictPort',
      cwd: './frontend',
      url: 'http://localhost:4300',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PREVIEW_API_TARGET: 'http://localhost:5100',
      },
    },
  ],
});
