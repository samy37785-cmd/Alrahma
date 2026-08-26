/**
 * Real HTML prerendering — runs as the "postbuild" step after `vite build`.
 *
 * The app is client-rendered (main.jsx uses createRoot, not hydrateRoot), so
 * a non-JS-executing crawler's first response is otherwise always Vite's one
 * generic dist/index.html: sitewide title/description only, no per-page
 * canonical, no per-page JSON-LD, and for ar/es/de no indexable URL at all
 * (language switching is ?lang=-only, and useSEO.js's canonical is computed
 * from window.location.pathname alone, so a query-param-localized page can
 * never be self-canonical). This script visits every {route, lang} pair from
 * seoRoutes.mjs × the 6 supported languages in a headless browser, captures
 * the fully-rendered DOM, and writes one real HTML file per pair into dist/
 * — no vercel.json routing change needed, Vercel already resolves an exact
 * static file before its SPA catch-all rewrite.
 *
 * Capture now navigates to the real prefixed URL (see the worker loop
 * below), so useSEO.js's own canonical/hreflang/og:locale/og:url all compute
 * correctly at capture time with no manual DOM patching needed afterward —
 * an earlier version of this script navigated via a `?lang=` query string
 * instead (useSEO.js couldn't derive a prefixed canonical from that) and
 * patched the captured DOM to compensate; that patch outlived the query-
 * string capture it was written for and had gone circular (it overwrote
 * canonical.href to the expected value, then a "correctness" check read that
 * same overwritten value back) before being removed here.
 *
 * IMPORTANT: this relies on nothing else placing a same-path file under
 * frontend/public/<lang>/... — such a file would be copied into dist/ by
 * `vite build` first and then silently shadow (and self-perpetuate, since
 * this script's own capture navigates through the live preview server)
 * whatever this script would otherwise generate for that route. Confirmed
 * as a real, previously-shipped bug: frontend/public/fr/index.html and
 * public/it/index.html were legacy Phase-1 static landing pages at exactly
 * this URL shape, so /fr/ and /it/ silently never ran the real SPA at all
 * (no hydration, no routing fix, broken same-page nav to /en/) despite this
 * script "successfully" prerendering them every build. Removed in the
 * Phase 2 routing-fix pass once the real i18n-driven Home page was
 * confirmed to already carry equal-or-richer translated content.
 *
 * Spins up an isolated seeded backend + a `vite preview` server on a port
 * pair (5300/4500) deliberately distinct from the e2e suite's (5100/4300),
 * so a local `npm run build` can never collide with a concurrently running
 * `npx playwright test`.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seoRoutes } from './seoRoutes.mjs';
import { LANGS, urlFor, hreflangSetFor, outputRelPathFor, pathFor, PRERENDER_EXCLUDED_ROUTES } from './prerender-seo-tags.mjs';
import { OG_LOCALE_MAP } from '../src/utils/localePath.js';

// Must match useSEO.js's SITE constant + its no-`title`-prop fallback
// template exactly — used by the route-identity check below.
const DEFAULT_TITLE = 'AL-Rahma Academy — Learn the Holy Quran Online';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const repoRoot = join(frontendRoot, '..');
const distDir = join(frontendRoot, 'dist');

const BACKEND_PORT = 5300;
const PREVIEW_PORT = 4500;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
// Sequential capture (~20s/page, dominated by networkidle + full SPA boot on
// every navigation) made the full 234-pair matrix take ~85 minutes — far too
// slow for a CI build step. Each {route, lang} pair is independent, so
// multiple pages in the same context run concurrently instead.
const CONCURRENCY = 6;

// Our own backend: only the /api/blog list endpoint is ever fetched by any
// public page on mount (verified by grepping every page under src/pages for
// useQuery|api\.(get|post)\(|fetch\( — HadithLibrary's CDN fetches only fire
// on a button click, AuthContext's session-restore effect only fires with a
// cached login, which a fresh Playwright context never has). Deliberately
// does NOT match /api/blog/:slug — that's blogController.js's getPost
// handler, which does a real $inc:{views:1} mutation on every GET, and is
// exactly what this allowlist exists to keep prerender traffic away from
// once real posts exist (seoRoutes.mjs has zero blog-slug entries today).
const ALLOWED_BACKEND_PATTERN = /^\/api\/blog\/?(?:\?.*)?$/;

// External read-only APIs some tool pages call live on mount. quran.js hits
// api.quran.com/verses.quran.com/api.alquran.cloud (already allowed in
// vercel.json's CSP connect-src); download.quranicaudio.com is where
// getChapterAudio()'s response points the Quran reader's <audio src> at
// (vercel.json's CSP media-src) — found only once the request-guard
// predicate was broadened to actually route every cross-origin request
// through this check (previously silently allowed through unrouted, unseen,
// exactly the gap that broadening fixed). GET-only here is enforced same as
// the backend check: these are safe reads, but a non-GET to any of them
// would still be unexpected.
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'api.quran.com', 'verses.quran.com', 'api.alquran.cloud', 'download.quranicaudio.com',
]);

// VerseOfTheDayPage.jsx's getVerse() call (api.quran.com) is the one legitimate
// external call that must NOT be allowed through during prerender: capturing
// whatever verse resolves on build day would freeze that specific day's verse
// into the static file forever. Blocking it here makes the component fall
// back to its own existing "could not load" state — stable, honest, and
// never a wrong verse — while real visitors' own browsers make this same
// request live and unblocked after hydration, unaffected by this guard.
const TIME_SENSITIVE_BLOCKS = [{ route: '/tools/verse-of-the-day', hostname: 'api.quran.com' }];

// <VercelAnalytics /> (App.jsx) renders unconditionally on every page and
// loads this script + sends a pageview beacon in a real production build —
// which `vite preview` here serves. Previously silently allowed through by
// the narrower request-guard predicate (never even reached the handler);
// broadening that predicate (see below) means it now would be, and 234+
// real beacons per build is neither wanted (pollutes real Analytics data)
// nor a security-relevant "violation" — block it everywhere, deliberately,
// same as TIME_SENSITIVE_BLOCKS but not tied to one specific route.
const GLOBALLY_BLOCKED_HOSTS = new Set(['va.vercel-scripts.com']);

function log(msg) {
  console.log(`[prerender] ${msg}`);
}

function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) {
        return reject(new Error(`Timed out waiting for ${url}`));
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

// Awaited by callers: on Windows this used to fire-and-forget `taskkill`,
// so main()'s process.exit() could land before the tree was actually gone —
// confirmed in practice as a real "port already in use" failure on a
// quick-succession rebuild, from the previous run's preview server still
// tearing down. Waiting for taskkill's own exit (or a short grace period on
// POSIX) closes that race instead of relying on the next run's luck.
function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const tk = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      tk.on('exit', resolve);
      tk.on('error', resolve);
    });
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  return new Promise((resolve) => setTimeout(resolve, 300));
}

async function main() {
  log('starting isolated backend...');
  const backend = spawn('node', ['scripts/e2eServer.js'], {
    cwd: join(repoRoot, 'backend'),
    env: {
      ...process.env,
      E2E_BACKEND_PORT: String(BACKEND_PORT),
      CLIENT_URL: PREVIEW_URL,
    },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });

  log('starting preview server...');
  const preview = spawn('npm', [
    'run', 'preview', '--', '--port', String(PREVIEW_PORT), '--strictPort',
  ], {
    cwd: frontendRoot,
    env: { ...process.env, PREVIEW_API_TARGET: BACKEND_URL },
    stdio: 'inherit',
    shell: process.platform === 'win32', // spawning npm.cmd directly on Windows fails with EINVAL
    detached: process.platform !== 'win32',
  });

  let browser;
  try {
    await waitForUrl(`${BACKEND_URL}/health`, 240_000);
    log('backend ready.');
    await waitForUrl(PREVIEW_URL, 60_000);
    log('preview server ready.');

    // Standard Playwright-downloaded Chromium works fine locally and in
    // GitHub Actions CI (Ubuntu), but fails to launch on Vercel's build
    // container — confirmed live: it downloads, then errors "error while
    // loading shared libraries: libnspr4.so: cannot open shared object
    // file", and there's no root/apt access there to install it. Vercel
    // sets VERCEL=1 during builds; only there, swap in @sparticuz/chromium's
    // bundled, statically-linked binary (built for exactly this class of
    // restricted environment) instead of Playwright's own download.
    let launchOptions = {};
    if (process.env.VERCEL) {
      const { default: sparticuz } = await import('@sparticuz/chromium');
      launchOptions = { executablePath: await sparticuz.executablePath(), args: sparticuz.args };
    }
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/_vercel/**', (route) => route.fulfill({ status: 204, body: '' }));

    const pairs = [];
    for (const route of seoRoutes) {
      if (PRERENDER_EXCLUDED_ROUTES.has(route)) continue;
      for (const lang of LANGS) pairs.push({ route, lang });
    }

    const violations = [];
    let nextIndex = 0;
    let done = 0;
    // The en/'/' pair's output path IS dist/index.html — the exact file vite
    // preview's SPA fallback serves for any not-yet-captured route/lang pair
    // (see the retry comment above). Writing it immediately, mid-build, was
    // the actual root cause of that race: as soon as this one pair finished,
    // the "safe" generic fallback shell silently became a fully-hydrated
    // English-home page for the rest of the build, so any other in-flight
    // pair could get served THAT instead of the harmless Vite shell. Retrying
    // on a detected mismatch (still done above) made this survivable locally
    // but not under Vercel's build container, where it reproduced far more
    // often. Deferring this one write until every pair is captured removes
    // the race outright: dist/index.html stays `vite build`'s own untouched
    // output for the whole prerendering pass, so the fallback is always
    // harmless, and only gets overwritten with the real hydrated home page
    // once nothing can still be served through it as a fallback.
    let deferredHomeHtml = null;
    log(`prerendering ${pairs.length} {route, lang} pairs (${CONCURRENCY} workers)...`);

    async function worker() {
      const page = await context.newPage();
      // Applies to every navigation on this page: makes DeferredSection.jsx's
      // own "no IntersectionObserver" fallback fire, so every deferred
      // section mounts its real children immediately with no scrolling
      // needed — more complete than a scroll-and-poll workaround, since
      // every section must be revealed, not just one known target.
      await page.addInitScript(() => { delete window.IntersectionObserver; });

      // A real preventive guard, not just after-the-fact detection: route()
      // interception decides continue/abort before the request ever reaches
      // the network, so a disallowed call (e.g. blogController.js's
      // view-incrementing getPost) never actually fires during prerender —
      // the build still fails loudly via `violations`, but the side effect
      // itself is stopped, not just reported after it already happened.
      //
      // Matched by predicate, not '**/*': routing EVERY request (JS chunks,
      // CSS, fonts, images) through a Node round-trip is slow enough under
      // CONCURRENCY-way parallelism to blow past networkidle's timeout on
      // its own — confirmed by a real run timing out on plain page loads
      // once the catch-all pattern was tried. Same-origin non-/api/ asset
      // requests still bypass this handler entirely for that reason.
      //
      // Everything CROSS-origin is routed regardless of whether its hostname
      // is recognized — this used to be `ALLOWED_EXTERNAL_HOSTS.has(url.hostname)`,
      // which meant a call to any host NOT in that set (and not /api/*) never
      // reached the handler at all: silently allowed through, never checked
      // for GET-only, never logged as a violation. Routing by origin instead
      // means an unrecognized host still hits the handler below, which
      // already correctly treats "not /api/* and not an allowlisted external
      // GET" as a violation and aborts it — so this predicate change alone
      // closes the gap, no handler-body change needed. To re-verify by hand:
      // temporarily point one live external call (e.g. VerseOfTheDayPage's
      // fetch) at an unlisted host, confirm `npm run build` fails with that
      // host named in a violation, then revert.
      let current = null;
      const previewOrigin = new URL(PREVIEW_URL).origin;
      await page.route(
        (url) => url.pathname.startsWith('/api/') || url.origin !== previewOrigin,
        (route, req) => {
          if (!current) return route.continue();
          const method = req.method();
          const url = new URL(req.url());

          if (GLOBALLY_BLOCKED_HOSTS.has(url.hostname)) return route.abort(); // deliberate, not a violation

          const blockedForCapture = TIME_SENSITIVE_BLOCKS.some(
            (b) => b.route === current.route && b.hostname === url.hostname,
          );
          if (blockedForCapture) return route.abort(); // deliberate, not a violation

          if (ALLOWED_EXTERNAL_HOSTS.has(url.hostname)) {
            if (method !== 'GET') {
              violations.push(`${current.lang} ${current.route} → ${method} ${url.href} (external)`);
              return route.abort();
            }
            return route.continue();
          }

          // Everything else the browser sees is against PREVIEW_URL — vite
          // preview's own proxy forwards /api/* to the backend server-side,
          // invisible to this page-level listener — so the backend allowlist
          // check is on pathname, not on which port the request's URL claims.
          if (method !== 'GET' || !ALLOWED_BACKEND_PATTERN.test(url.pathname)) {
            violations.push(`${current.lang} ${current.route} → ${method} ${url.pathname}${url.search}`);
            return route.abort();
          }
          return route.continue();
        },
      );

      for (;;) {
        const i = nextIndex++;
        if (i >= pairs.length) break;
        const { route, lang } = pairs[i];
        current = { route, lang };

        // Navigate to the real prefixed URL (e.g. /fr/courses), not the old
        // /courses?lang=fr query-string hack — that predates the routing fix
        // and now actively conflicts with it: LangContext's saved-preference
        // redirect fires whenever the URL has no language prefix, which the
        // query-string form never has, so every non-English capture
        // immediately navigated away mid-page.evaluate() ("Execution context
        // was destroyed"). Navigating to the real URL is also strictly more
        // representative: it's exactly what Vercel serves and exactly what a
        // real visitor's first navigation looks like — vite preview's default
        // SPA fallback serves the base shell for a not-yet-written path
        // (this pair's own output doesn't exist until after this capture),
        // then client-side routing takes it from there, same as production.
        const target = `${PREVIEW_URL}${pathFor(route, lang)}`;
        const realUrl = urlFor(route, lang);
        const expectedHreflang = hreflangSetFor(route).map(({ hreflang, href }) => `${hreflang}:${href}`).sort();
        const expectedOgLocale = OG_LOCALE_MAP[lang];

        // One retry on: a timed-out navigation, a timed-out post-navigation
        // lang-attribute wait, OR a metadata mismatch that's plausibly this
        // same-origin race, not a real bug — under CONCURRENCY-way
        // parallelism, vite preview's SPA fallback (see the comment above
        // about "the base shell for a not-yet-written path") can momentarily
        // serve a DIFFERENT already-prerendered page's full HTML (whichever
        // pair last overwrote plain index.html — always the en/'/' pair, the
        // only one whose output path IS index.html) for a route/lang pair
        // whose own file doesn't exist yet. React itself always mounts the
        // correct page from the real URL (createRoot clears the container),
        // but the served document's original <head> tags occasionally
        // outrace useSEO.js's own head rewrite within this check's budget.
        // A full fresh re-navigation resolves it: by the second attempt the
        // race window has passed. A genuine routing/metadata bug reproduces
        // identically on the retry and still fails below.
        let hydrationCheck;
        for (let attempt = 1; ; attempt++) {
          try {
            await page.goto(target, { waitUntil: 'networkidle', timeout: 45_000 });
            await page.waitForFunction((l) => document.documentElement.getAttribute('lang') === l, lang, { timeout: 15_000 });
          } catch (err) {
            if (attempt >= 2 || !(err instanceof Error) || !err.message.includes('Timeout')) throw err;
            log(`WARN retrying ${lang} ${route} after a navigation timeout...`);
            continue;
          }
          // Real timer, not requestAnimationFrame — rAF can stall indefinitely
          // for a background/inactive page in headless mode, with no timeout
          // to fall back on since page.evaluate() has none by default.
          await page.waitForTimeout(50);

          // Real, per-pair post-hydration gate — not a post-hoc sample, and
          // not a patch-then-check (an earlier version of this manually
          // overwrote canonical.href/hreflang/lang/dir to the expected values
          // and then read those same overwritten values back, so it could
          // never catch React actually rendering something wrong-but-present
          // — see this file's header). Runs for all 234 pairs, right here
          // while the page is still fully hydrated, reading only what
          // React/useSEO.js/LangContext.jsx actually produced with no
          // patching first — the goto above already waits for
          // documentElement.lang to be correct, which LangContext.jsx sets
          // together with dir in the same effect, so both are already
          // genuine by this point.
          //
          // What this gate cannot see: a client-side <Link> navigation to a
          // different route — this script always does a fresh page.goto per
          // pair, never a same-page transition, so it structurally can't
          // catch hreflang/og:locale going stale after an internal-link
          // click. That's covered instead by e2e/seo-schema.spec.mjs's real
          // click-driven test.
          hydrationCheck = await page.evaluate(({ realUrl, lang }) => ({
            isNotFound: !!document.querySelector('.notfound-page'),
            reactMounted: (document.getElementById('root')?.children.length ?? 0) > 0,
            actualLang: document.documentElement.getAttribute('lang'),
            canonicalHref: document.head.querySelector('link[rel="canonical"]')?.href || null,
            hreflangHrefs: Array.from(document.head.querySelectorAll('link[rel="alternate"][hreflang]'))
              .map((el) => `${el.hreflang}:${el.href}`)
              .sort(),
            ogLocale: document.head.querySelector('meta[property="og:locale"]')?.getAttribute('content') || null,
            title: document.title,
          }), { realUrl, lang });

          const metadataMismatch = hydrationCheck.canonicalHref !== realUrl
            || JSON.stringify(hydrationCheck.hreflangHrefs) !== JSON.stringify(expectedHreflang)
            || hydrationCheck.ogLocale !== expectedOgLocale;
          if (metadataMismatch && attempt < 2) {
            log(`WARN retrying ${lang} ${route} after a stale-fallback-shell metadata mismatch...`);
            continue;
          }
          break;
        }

        if (hydrationCheck.isNotFound) violations.push(`${lang} ${route} → rendered NotFound after hydration`);
        if (!hydrationCheck.reactMounted) violations.push(`${lang} ${route} → React never mounted (#root empty) — likely shadowed by a static file`);
        if (hydrationCheck.actualLang !== lang) violations.push(`${lang} ${route} → documentElement.lang is "${hydrationCheck.actualLang}", expected "${lang}"`);
        if (hydrationCheck.canonicalHref !== realUrl) violations.push(`${lang} ${route} → canonical is "${hydrationCheck.canonicalHref}", expected "${realUrl}"`);
        if (JSON.stringify(hydrationCheck.hreflangHrefs) !== JSON.stringify(expectedHreflang)) {
          violations.push(`${lang} ${route} → hreflang set is wrong: got ${JSON.stringify(hydrationCheck.hreflangHrefs)}, expected ${JSON.stringify(expectedHreflang)}`);
        }
        if (hydrationCheck.ogLocale !== expectedOgLocale) {
          violations.push(`${lang} ${route} → og:locale is "${hydrationCheck.ogLocale}", expected "${expectedOgLocale}"`);
        }
        // Route-identity check: a non-home page must produce a page-specific
        // <title>, not useSEO.js's generic no-title-prop fallback — catches
        // "some page rendered, not necessarily the *right* page" (a
        // React Router matching bug), which #root-non-empty/lang-correct/
        // canonical-correct alone could still miss if it renders a
        // plausible-looking wrong page.
        if (route !== '/' && hydrationCheck.title === DEFAULT_TITLE) {
          violations.push(`${lang} ${route} → <title> is the generic site default ("${DEFAULT_TITLE}") — this route isn't setting its own title`);
        }

        const html = await page.content();
        const outRelPath = outputRelPathFor(route, lang);
        if (outRelPath === 'index.html') {
          // Deferred — see the comment by this variable's declaration above.
          deferredHomeHtml = html;
        } else {
          const outPath = join(distDir, outRelPath);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, html);
        }

        done += 1;
        if (done % 20 === 0) log(`  ${done}/${pairs.length} written`);
      }
      await page.close();
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Safe to write now — every other pair has already been captured, so
    // nothing can be served this file as a wrong-page SPA fallback anymore.
    if (deferredHomeHtml) {
      const homeOutPath = join(distDir, 'index.html');
      mkdirSync(dirname(homeOutPath), { recursive: true });
      writeFileSync(homeOutPath, deferredHomeHtml);
    }
    log(`  ${done}/${pairs.length} written`);

    if (violations.length > 0) {
      log('FAILED — request-guard or post-hydration violations observed during prerender:');
      for (const v of violations) log(`  ${v}`);
      process.exitCode = 1;
    } else {
      log(`wrote ${pairs.length} prerendered files — all ${pairs.length} passed the post-hydration gate (no NotFound, React mounted, lang and canonical correct).`);
    }

    await browser.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    await Promise.all([killTree(backend), killTree(preview)]);
  }

  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
