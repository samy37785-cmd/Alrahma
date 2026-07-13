import { test, expect } from '@playwright/test';
import { preparePage } from './support/helpers.mjs';

// The Quran reader loads verse content from the external quran.com API.
// The smoke assertion is deliberately limited to the app's own shell
// (top bar, tabs) so a third-party outage can't fail CI, and the screenshot
// masks the verse content area for the same reason.
test.describe('quran reader', () => {
  test('reader shell renders', async ({ page }) => {
    await preparePage(page);
    await page.goto('/tools/quran-reader');
    await expect(page.locator('.qlc__bar')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.qlc__tabs')).toBeVisible();
  });

  test('reader shell visual baseline (content masked)', async ({ page }) => {
    await preparePage(page);
    await page.goto('/tools/quran-reader');
    await expect(page.locator('.qlc__bar')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('quran-shell.png', {
      // Mask everything below the app-owned chrome — verse text, skeletons,
      // or an API error state may occupy it depending on network conditions.
      mask: [page.locator('main')],
      // External images/fonts inside the masked area may still be loading.
      timeout: 20_000,
    });
  });
});
