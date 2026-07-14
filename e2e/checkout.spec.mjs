import { test, expect } from '@playwright/test';
import { preparePage, loginAsStudent, scrollToDeferredSection } from './support/helpers.mjs';

test.describe('checkout modal', () => {
  test('selecting a plan opens the checkout modal', async ({ page }) => {
    await preparePage(page);
    await loginAsStudent(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await scrollToDeferredSection(page, '#pricing');
    await expect(page.locator('.plan').first()).toBeVisible({ timeout: 15_000 });

    // Each plan card's CTA sets the selected plan → CheckoutModal mounts.
    await page.locator('.plan button.btn--block').first().click();
    const modal = page.locator('.modal__card.checkout');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => document.fonts.ready);
    // Element screenshot, not page: the page's scroll offset behind the
    // modal varies by a few px per run on mobile and is not what this
    // baseline is protecting.
    await expect(modal).toHaveScreenshot('checkout-modal.png');
  });
});
