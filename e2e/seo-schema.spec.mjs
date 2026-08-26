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

// Regression coverage for a bug a manual review round found live: useSEO.js
// updates canonical/og:url on every route change but never touched hreflang
// or og:locale, so a real client-side <Link> navigation (e.g. Ijazah →
// Teachers) left every hreflang tag — and og:locale — describing the page
// you navigated away from. prerender.mjs's build-time gate structurally
// cannot catch this: it always does a fresh page.goto per {route,lang} pair,
// never a same-page transition — this is the one check that actually clicks.
async function headMeta(page) {
  return page.evaluate(() => ({
    canonical: document.head.querySelector('link[rel="canonical"]')?.href || null,
    hreflangHrefs: Array.from(document.head.querySelectorAll('link[rel="alternate"][hreflang]'))
      .map((el) => el.href)
      .sort(),
    ogLocale: document.head.querySelector('meta[property="og:locale"]')?.getAttribute('content') || null,
    lang: document.documentElement.getAttribute('lang'),
  }));
}

test.describe('SEO metadata (hreflang, og:locale, canonical) stays correct across client-side navigation', () => {
  test('navigating from /fr/courses/ijazah to /fr/academy/teachers updates every hreflang tag and og:locale, not just canonical', async ({ page }) => {
    const errors = await preparePage(page);

    await page.goto('/fr/courses/ijazah');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => headMeta(page).then((m) => m.lang)).toBe('fr');
    const before = await headMeta(page);
    expect(before.canonical).toContain('/fr/courses/ijazah');
    expect(before.hreflangHrefs.some((h) => h.includes('/courses/ijazah'))).toBe(true);
    expect(before.ogLocale).toBe('fr_FR');

    // Scoped to #main-content, not a bare page-wide selector — Header's
    // Academy dropdown also contains a /academy/teachers link, present in
    // the DOM but hidden until its dropdown opens; matching it instead of
    // the page's own always-visible hero link made this test flake.
    const teachersLink = page.locator('#main-content a[href*="/academy/teachers"]').first();
    await teachersLink.click();
    await page.waitForURL('**/fr/academy/teachers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect.poll(() => headMeta(page).then((m) => m.canonical)).toContain('/fr/academy/teachers');
    const after = await headMeta(page);
    expect(after.lang).toBe('fr');
    expect(after.ogLocale).toBe('fr_FR');
    // The real bug: every hreflang href must now point at /academy/teachers —
    // none may still say /courses/ijazah (the page navigated away from).
    expect(after.hreflangHrefs.length).toBeGreaterThan(0);
    for (const href of after.hreflangHrefs) {
      expect(href).toContain('/academy/teachers');
      expect(href).not.toContain('/courses/ijazah');
    }

    expect(errors).toEqual([]);
  });
});
