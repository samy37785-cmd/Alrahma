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
    // Fixed-dimension clip anchored at the modal's top-left. Neither a page
    // screenshot (background scroll offset varies per run on mobile) nor a
    // plain element screenshot (the modal's own height rounds 574/575px
    // between runs, and ANY size mismatch fails regardless of tolerance)
    // is stable here.
    const box = await modal.boundingBox();
    await expect(page).toHaveScreenshot('checkout-modal.png', {
      clip: {
        x: Math.ceil(box.x),
        y: Math.ceil(box.y),
        width: Math.floor(box.width) - 1,
        height: Math.min(Math.floor(box.height) - 1, 540),
      },
    });
  });
});
