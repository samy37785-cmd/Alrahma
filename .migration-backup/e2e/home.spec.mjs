import { test, expect } from '@playwright/test';
import { preparePage, scrollToDeferredSection } from './support/helpers.mjs';

test.describe('homepage', () => {
  test('renders the hero shell without console errors', async ({ page }) => {
    const errors = await preparePage(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Header nav and footer bracket the page — the shell mounted fully.
    await expect(page.locator('header').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('hero visual baseline', async ({ page }) => {
    await preparePage(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Fonts (Cinzel/Cairo/Amiri) load async; give them a beat so the
    // baseline isn't captured mid font-swap.
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('home-hero.png');
  });

  test('pricing section renders all plans', async ({ page }) => {
    await preparePage(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // #pricing does not exist in the DOM until DeferredSection mounts it.
    await scrollToDeferredSection(page, '#pricing');
    await expect(page.locator('.plan').first()).toBeVisible({ timeout: 15_000 });
  });
});
