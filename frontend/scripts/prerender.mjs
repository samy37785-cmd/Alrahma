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
 * the fully-rendered DOM, corrects the tags useSEO.js gets wrong for a
 * query-param-driven capture, and writes one real HTML file per pair into
 * dist/ — no vercel.json routing change needed, Vercel already resolves an
 * exact static file before its SPA catch-all rewrite.
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
import { LANGS, urlFor, hreflangSetFor, dirFor, outputRelPathFor, pathFor, PRERENDER_EXCLUDED_ROUTES } from './prerender-seo-tags.mjs';

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

// External read-only APIs some tool pages call live on mount (found by
// actually running this guard, not by the earlier static grep — quran.js
// hits these three hosts; same set already allowed in vercel.json's CSP
// connect-src). GET-only here is enforced same as the backend check: these
// are safe reads, but a non-GET to any of them would still be unexpected.
const ALLOWED_EXTERNAL_HOSTS = new Set(['api.quran.com', 'verses.quran.com', 'api.alquran.cloud']);

// VerseOfTheDayPage.jsx's getVerse() call (api.quran.com) is the one legitimate
// external call that must NOT be allowed through during prerender: capturing
// whatever verse resolves on build day would freeze that specific day's verse
// into the static file forever. Blocking it here makes the component fall
// back to its own existing "could not load" state — stable, honest, and
// never a wrong verse — while real visitors' own browsers make this same
// request live and unblocked after hydration, unaffected by this guard.
const TIME_SENSITIVE_BLOCKS = [{ route: '/tools/verse-of-the-day', hostname: 'api.quran.com' }];

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
      // once the catch-all pattern was tried. Only /api/* and the external
      // API hosts are ever worth inspecting; everything else should never
      // even reach this handler.
      let current = null;
      await page.route(
        (url) => url.pathname.startsWith('/api/') || ALLOWED_EXTERNAL_HOSTS.has(url.hostname),
        (route, req) => {
          if (!current) return route.continue();
          const method = req.method();
          const url = new URL(req.url());

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
        // One retry on a timed-out navigation: under CONCURRENCY-way
        // parallelism (and on a shared CI/dev machine with other load), a
        // single otherwise-healthy page can occasionally miss networkidle
        // within budget — confirmed in practice as a different, unrelated
        // route timing out on successive runs, not the same one, which is
        // the signature of transient contention rather than a real hang. A
        // genuine routing bug fails the same page every time regardless.
        try {
          await page.goto(target, { waitUntil: 'networkidle', timeout: 45_000 });
        } catch (err) {
          if (!(err instanceof Error) || !err.message.includes('Timeout')) throw err;
          log(`WARN retrying ${lang} ${route} after a navigation timeout...`);
          await page.goto(target, { waitUntil: 'networkidle', timeout: 45_000 });
        }
        await page.waitForFunction((l) => document.documentElement.getAttribute('lang') === l, lang, { timeout: 15_000 });
        // Real timer, not requestAnimationFrame — rAF can stall indefinitely
        // for a background/inactive page in headless mode, with no timeout
        // to fall back on since page.evaluate() has none by default.
        await page.waitForTimeout(50);

        const realUrl = urlFor(route, lang);
        const hreflang = hreflangSetFor(route);
        const dir = dirFor(lang);
        await page.evaluate(({ realUrl, hreflang, dir, lang }) => {
          const canonical = document.head.querySelector('link[rel="canonical"]');
          if (canonical) canonical.href = realUrl;
          const ogUrl = document.head.querySelector('meta[property="og:url"]');
          if (ogUrl) ogUrl.setAttribute('content', realUrl);

          document.documentElement.setAttribute('lang', lang);
          document.documentElement.setAttribute('dir', dir);

          document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
          for (const { hreflang: hl, href } of hreflang) {
            const link = document.createElement('link');
            link.rel = 'alternate';
            link.hreflang = hl;
            link.href = href;
            document.head.appendChild(link);
          }
        }, { realUrl, hreflang, dir, lang });

        const html = await page.content();
        const outPath = join(distDir, outputRelPathFor(route, lang));
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, html);

        done += 1;
        if (done % 20 === 0) log(`  ${done}/${pairs.length} written`);
      }
      await page.close();
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    log(`  ${done}/${pairs.length} written`);

    if (violations.length > 0) {
      log('FAILED — non-GET or non-allowlisted requests observed during prerender:');
      for (const v of violations) log(`  ${v}`);
      process.exitCode = 1;
    } else {
      log(`wrote ${pairs.length} prerendered files.`);

      // Post-hydration spot check: reload a representative sample of the
      // files just written — through the same preview server, as a real
      // browser would — and confirm React actually renders the intended
      // page once it mounts, not <Routes>'s path="*" NotFound. This is the
      // exact class of bug a static-HTML-only check (verify-prerender.mjs)
      // or a console-errors-only check can't see: a language-prefixed URL
      // whose live app has no matching route renders NotFound cleanly, with
      // no console/pageerror event at all. Blocking — this is precisely the
      // gap that let that bug ship once already.
      const spotChecks = LANGS.flatMap((lang) => [
        { route: '/', lang },
        { route: '/courses/ijazah', lang },
      ]);
      const notFoundHits = [];
      const checkPage = await context.newPage();
      for (const { route, lang } of spotChecks) {
        const errors = [];
        const onConsole = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
        const onPageError = (err) => errors.push(String(err));
        checkPage.on('console', onConsole);
        checkPage.on('pageerror', onPageError);
        const outPath = `${PREVIEW_URL}${pathFor(route, lang)}`;
        try {
          await checkPage.goto(outPath, { waitUntil: 'networkidle' });
          const state = await checkPage.evaluate(() => ({
            isNotFound: !!document.querySelector('.notfound-page'),
            // A same-path file under frontend/public/ (or any other static
            // file that shadows this route) never loads the SPA bundle at
            // all, so #root stays empty — .notfound-page alone can't catch
            // that, since there's no React there to render it. Confirmed as
            // a real, previously-shipped bug (see this file's header).
            reactMounted: (document.getElementById('root')?.children.length ?? 0) > 0,
          }));
          if (state.isNotFound) notFoundHits.push(`${lang} ${route} → rendered NotFound after hydration at ${outPath}`);
          if (!state.reactMounted) notFoundHits.push(`${lang} ${route} → React never mounted (#root empty) at ${outPath} — likely shadowed by a static file`);
        } finally {
          checkPage.off('console', onConsole);
          checkPage.off('pageerror', onPageError);
        }
        if (errors.length > 0) {
          log(`WARN console errors on ${lang} ${route}: ${errors.join(' | ')}`);
        }
      }
      await checkPage.close();

      if (notFoundHits.length > 0) {
        log('FAILED — prerendered page(s) rendered NotFound once React hydrated:');
        for (const h of notFoundHits) log(`  ${h}`);
        process.exitCode = 1;
      }
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
