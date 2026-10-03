import { chromium } from 'playwright';

// Real-browser layout tests need Playwright's Chromium. Where it is not
// installed (the browser-less "Frontend vitest" CI step, a fresh checkout) they
// are skipped visibly. With REQUIRE_CHROMIUM=1 (set by the CI step that runs
// after "Install Playwright Chromium") a missing browser is an error, so these
// tests can never silently skip there.
export async function launchChromiumOrSkip(label) {
  try {
    return await chromium.launch();
  } catch (error) {
    if (process.env.REQUIRE_CHROMIUM === '1') throw error;
    console.warn(`[${label}] Chromium unavailable, layout tests skipped: ${String(error.message).split('\n')[0]}`);
    return null;
  }
}
