import { test, expect } from '@playwright/test';
import { preparePage, loginAsStudent } from './support/helpers.mjs';

// Dark-mode visual baselines (Phase 6). The theme is override-based
// (html.dark rules in styles/dark.css), which is exactly the debt the
// roadmap's token-driven theming work targets — these baselines exist so
// that work (and any component change) can't silently break dark mode.
// ThemeContext reads localStorage 'al-rahma-theme' at boot.

test.use({ colorScheme: 'dark' });

async function forceDarkTheme(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('al-rahma-theme', 'dark'); } catch { /* noop */ }
  });
}

test.describe('dark mode', () => {
  test('home hero dark baseline', async ({ page }) => {
    await preparePage(page);
    await forceDarkTheme(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html.dark')).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('home-hero-dark.png');
  });

  test('dashboard dark baseline', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-15T10:00:00') });
    await preparePage(page);
    await forceDarkTheme(page);
    await loginAsStudent(page);
    await expect(page.locator('html.dark')).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('dashboard-dark.png');
  });
});
