import { test, expect } from '@playwright/test';
import { preparePage, loginAsStudent } from './support/helpers.mjs';

test.describe('auth + student dashboard', () => {
  test('login form renders', async ({ page }) => {
    const errors = await preparePage(page);
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('student can log in and the dashboard renders', async ({ page }) => {
    // The greeting ("Good morning…") and date labels depend on wall-clock
    // time — pin it so the visual baseline is identical across runs/days.
    await page.clock.install({ time: new Date('2026-01-15T10:00:00') });

    const errors = await preparePage(page);
    await loginAsStudent(page);

    // Layout shell: sidebar nav + page heading mounted.
    await expect(page.locator('h1.ds-page-hd__title')).toBeVisible();
    await expect(page.locator('nav').first()).toBeVisible();

    expect(errors).toEqual([]);

    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('dashboard.png');
  });

  test('login visual baseline', async ({ page }) => {
    await preparePage(page);
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('login.png');
  });
});
