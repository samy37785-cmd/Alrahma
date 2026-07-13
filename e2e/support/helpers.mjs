import { expect } from '@playwright/test';

// Seeded by backend/scripts/e2eServer.js — keep in sync.
export const E2E_STUDENT = {
  email: 'e2e.student@alrahma.test',
  password: 'E2e!Passw0rd42',
};

/**
 * Environment stubs + console-error tracking for a page. Call BEFORE the
 * first navigation; assert `expect(errors).toEqual([])` at the end.
 *
 * Stubs `/_vercel/insights/script.js` (injected at runtime by
 * @vercel/analytics in App.jsx): it only exists when hosted on Vercel, and
 * locally its 404/HTML fallback intermittently throws a script parse error
 * that has nothing to do with the app under test.
 */
export async function preparePage(page, ignore = []) {
  await page.route(/\/_vercel\//, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );

  const errors = [];
  const isIgnored = (text) => ignore.some((re) => re.test(text));
  page.on('pageerror', (err) => {
    if (!isIgnored(err.message)) errors.push(`pageerror: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnored(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
  });
  return errors;
}

/**
 * Home's below-the-fold sections mount lazily (DeferredSection +
 * IntersectionObserver with a 600px root margin), so their DOM — including
 * anchor ids like #pricing — does not exist until the user scrolls near
 * them. Scrolls viewport-by-viewport until `selector` is attached.
 */
export async function scrollToDeferredSection(page, selector) {
  const el = page.locator(selector);
  for (let i = 0; i < 30; i++) {
    if ((await el.count()) > 0) break;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(200);
  }
  await el.scrollIntoViewIfNeeded();
  return el;
}

/** Logs in through the real /login form and waits for the dashboard. */
export async function loginAsStudent(page) {
  await page.goto('/login');
  await page.locator('#email').fill(E2E_STUDENT.email);
  await page.locator('#password').fill(E2E_STUDENT.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
