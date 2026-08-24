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
 * exact static file before its SPA catch-all rewrite (proven today by
 * dist/it/index.html and dist/fr/index.html).
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
import { LANGS, urlFor, hreflangSetFor, dirFor, outputRelPathFor, PRERENDER_EXCLUDED_ROUTES } from './prerender-seo-tags.mjs';

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

// Our own backend: only /api/blog is ever fetched by any public page on
// mount (verified by grepping every page under src/pages for
// useQuery|api\.(get|post)\(|fetch\( — HadithLibrary's CDN fetches only fire
// on a button click, AuthContext's session-restore effect only fires with a
// cached login, which a fresh Playwright context never has). This allowlist
// exists specifically to catch backend/controllers/blogController.js's
// getPost handler, which does a real $inc:{views:1} mutation on every GET —
// currently a non-issue only because seoRoutes.mjs has zero blog-slug
// entries, but this guard fails the build loudly the moment that changes
// before real posts exist to safely receive prerender traffic.
const ALLOWED_BACKEND_PATTERN = /^\/api\/blog(\/|$|\?)/;

// External read-only APIs some tool pages call live on mount (found by
// actually running this guard, not by the earlier static grep — quran.js
// hits these three hosts; same set already allowed in vercel.json's CSP
// connect-src). GET-only here is enforced same as the backend check: these
// are safe reads, but a non-GET to any of them would still be unexpected.
const ALLOWED_EXTERNAL_HOSTS = new Set(['api.quran.com', 'verses.quran.com', 'api.alquran.cloud']);

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

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
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

      let current = null;
      page.on('request', (req) => {
        if (!current) return;
        const method = req.method();
        const url = new URL(req.url());

        if (ALLOWED_EXTERNAL_HOSTS.has(url.hostname)) {
          if (method !== 'GET') {
            violations.push(`${current.lang} ${current.route} → ${method} ${url.href} (external)`);
          }
          return;
        }

        // Everything else the browser sees is against PREVIEW_URL — vite
        // preview's own proxy forwards /api/* to the backend server-side,
        // invisible to this page-level listener — so the backend allowlist
        // check is on pathname, not on which port the request's URL claims.
        if (!url.pathname.startsWith('/api/')) return; // static asset — irrelevant here
        if (method !== 'GET' || !ALLOWED_BACKEND_PATTERN.test(url.pathname)) {
          violations.push(`${current.lang} ${current.route} → ${method} ${url.pathname}${url.search}`);
        }
      });

      for (;;) {
        const i = nextIndex++;
        if (i >= pairs.length) break;
        const { route, lang } = pairs[i];
        current = { route, lang };

        const target = `${PREVIEW_URL}${route}${route.includes('?') ? '&' : '?'}lang=${lang}`;
        await page.goto(target, { waitUntil: 'networkidle' });
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

      // Soft console-error spot check (createRoot fully replaces the
      // prerendered DOM on mount, so there is no hydration-mismatch risk in
      // the React sense — this checks for a plain runtime/console error on
      // first client mount instead). Non-blocking: warn only, kept soft
      // until proven quiet across a few real builds.
      const spotChecks = [
        { route: '/', lang: 'en' },
        { route: '/courses/ijazah', lang: 'en' },
        { route: '/academy/teachers/1', lang: 'ar' },
        { route: '/tools/prayer-times', lang: 'fr' },
      ];
      const checkPage = await context.newPage();
      for (const { route, lang } of spotChecks) {
        const errors = [];
        const onConsole = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
        const onPageError = (err) => errors.push(String(err));
        checkPage.on('console', onConsole);
        checkPage.on('pageerror', onPageError);
        const outPath = `${PREVIEW_URL}${pathForCheck(route, lang)}`;
        try {
          await checkPage.goto(outPath, { waitUntil: 'networkidle' });
        } finally {
          checkPage.off('console', onConsole);
          checkPage.off('pageerror', onPageError);
        }
        if (errors.length > 0) {
          log(`WARN console errors on ${lang} ${route}: ${errors.join(' | ')}`);
        }
      }
      await checkPage.close();
    }

    await browser.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    killTree(backend);
    killTree(preview);
  }

  if (process.exitCode) process.exit(process.exitCode);
}

// Reload path for the spot check — the actual written file, served statically
// by the still-running preview server (not a fresh ?lang= render).
function pathForCheck(route, lang) {
  return lang === 'en' ? route : (route === '/' ? `/${lang}/` : `/${lang}${route}`);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
