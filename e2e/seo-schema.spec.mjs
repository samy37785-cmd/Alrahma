import { test, expect } from '@playwright/test';
import { preparePage, scrollToDeferredSection } from './support/helpers.mjs';

// Regression coverage for the schema-bleed bug: index.html's static JSON-LD
// (Organization/WebSite) has no data-seo attribute, so useSEO.js's
// setJsonLd can never touch it and it must survive every navigation
// unchanged; useSEO's own dynamic blocks (FAQ on Home, Breadcrumb/Course on
// content pages) must be fully swapped on real client-side navigation, not
// just on a fresh page load — the bug only showed up on navigation.

async function jsonLdTypes(page) {
  return page.evaluate(() =>
    Array.from(document.head.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => { try { return JSON.parse(s.textContent)['@type']; } catch { return null; } })
      .flat(),
  );
}

test.describe('structured data is scoped per route across client-side navigation', () => {
  test('FAQPage only exists on Home and is not left over after navigating away and back', async ({ page }) => {
    const errors = await preparePage(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // useSEO's effect runs after mount+paint, so it can lag a visible
    // heading by a tick — poll document.head instead of reading it once,
    // to avoid a race against that effect on slower viewports/CI runners.
    await expect.poll(() => jsonLdTypes(page)).toContain('FAQPage');
    let types = await jsonLdTypes(page);
    expect(types.filter((t) => t === 'FAQPage')).toHaveLength(1);

    // Real client-side navigation (link click), not page.goto — the bug only
    // reproduced when React Router unmounted Home without a full reload.
    // The header's course links live behind a desktop dropdown / mobile
    // accordion that differ per viewport; the "Browse all courses" link in
    // the page body is a single stable target on both.
    const browseAll = await scrollToDeferredSection(page, '.courses__browse-all');
    await browseAll.click();
    await page.waitForURL('**/courses');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => jsonLdTypes(page)).not.toContain('FAQPage');

    await page.goBack();
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => jsonLdTypes(page)).toContain('FAQPage');
    types = await jsonLdTypes(page);
    expect(types.filter((t) => t === 'FAQPage')).toHaveLength(1);

    expect(errors).toEqual([]);
  });

  test('/resources/blog renders its empty state instead of crashing on {posts: []}', async ({ page }) => {
    const errors = await preparePage(page);
    await page.goto('/resources/blog');
    await expect(page.getByText(/no articles/i)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
