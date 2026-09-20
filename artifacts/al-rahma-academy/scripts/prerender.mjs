#!/usr/bin/env node
// SEO Prerender Pilot (2026-09-20): runs as `postbuild`, right after
// `vite build` writes the normal SPA bundle to dist/public/. For each
// (route, locale) pair in scripts/prerender-routes.mjs's manifest, it
// boots that exact build behind `vite preview`, navigates a real headless
// Chromium to the real locale-prefixed URL (never a legacy `?lang=`
// trick), waits for genuine post-hydration SEO state — not a fixed sleep,
// not `lang` alone (see waitForHydratedSeo() below) — and writes the
// resulting HTML to a directory-index file. Vercel's static-file-first
// resolution (an exact file match always wins over the SPA catch-all
// rewrite in vercel.json) then serves it for that directory URL with zero
// vercel.json changes.
//
// Chromium: Playwright's own downloaded browser locally/in CI. Vercel's
// ephemeral build container lacks some shared libraries that download
// needs, so when `process.env.VERCEL` is set this swaps to
// @sparticuz/chromium's statically-linked build instead — the same
// pattern already proven on this product on the feat/seo-prerendering-phase2
// branch (different repo layout, same technique).
//
// This only ever runs at build time. The output is plain static HTML;
// nothing here runs Chromium, or any part of this script, when a real
// visitor requests a page — that request is served the static file (or
// the SPA shell for any route not in the manifest) exactly like any other
// static asset, with zero added latency and no server-side process.
//
// The '/' + 'en' pair is written LAST, after every other pair, so the SPA
// fallback shell at dist/public/index.html (which every non-manifest
// route still needs) is never replaced mid-run by a half-finished pass.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRERENDER_MANIFEST, urlPathFor, canonicalUrlFor, outputRelPathFor } from './prerender-routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist', 'public');

// Distinct from the dev/preview default (19795, see vite.config.ts) so a
// prerender run never collides with a developer's own `pnpm run dev` /
// `pnpm run serve` left running on the default port.
const PRERENDER_PORT = process.env.PRERENDER_PORT ?? '4319';
const PREVIEW_ORIGIN = `http://127.0.0.1:${PRERENDER_PORT}`;

// The exact static-shell <title> baked into index.html at build time —
// used as a negative check so a prerendered file is never accidentally
// just the pre-hydration shell (see waitForHydratedSeo()). Keep in sync
// with index.html's <title> by hand; there are only two, and
// prerenderOutput.test.js's own copy of this constant would catch a drift
// immediately (a title check that can never fail is worse than none).
const SHELL_TITLE = 'Al-Rahma Academy — Learn Quran Online | Tajweed, Hifz & Arabic';

// preview.kill() on Windows only signals the immediate spawned process —
// with shell:true that's cmd.exe, not the npx -> node -> vite chain
// underneath it, so the real preview server (and vite's own child
// processes) are left running and orphaned, silently holding the port
// open for the next run. Verified directly on this machine: a plain
// preview.kill() left a live process tree 4 levels deep. `taskkill /T /F`
// is the standard Windows mechanism for killing an entire process tree by
// its root PID; POSIX's preview.kill() already covers the whole
// process group there, since child_process.spawn does not shell=true
// re-parent children the same way on POSIX.
function killPreview(proc) {
  if (!proc || proc.killed || proc.pid == null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
  } else {
    proc.kill();
  }
}

// Also watches `proc` itself, not just the HTTP endpoint -- a naive
// poll-until-it-answers loop can succeed "by accident" if some other,
// unrelated process (e.g. a leftover preview server orphaned by an
// earlier run) happens to already be listening on the same port while
// THIS run's own preview process fails to bind (EADDRINUSE) and exits.
// That failure must abort the whole prerender run, not be silently
// masked by a coincidentally-answering port.
function waitForServer(proc, url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Preview server process exited before becoming ready (code=${code}, signal=${signal})`));
    };
    const onError = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    proc.once('exit', onExit);
    proc.once('error', onError);

    const tryOnce = async () => {
      if (settled) return;
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) {
          settled = true;
          proc.removeListener('exit', onExit);
          proc.removeListener('error', onError);
          return resolve(); // server is up and answering
        }
      } catch {
        // not up yet — keep polling
      }
      if (settled) return;
      if (Date.now() - start > timeoutMs) {
        settled = true;
        return reject(new Error(`Preview server did not become ready within ${timeoutMs}ms at ${url}`));
      }
      setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

async function launchBrowser(chromium) {
  if (process.env.VERCEL) {
    const sparticuzChromium = (await import('@sparticuz/chromium')).default;
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}

// Waits until the page is genuinely hydrated with the RIGHT page-specific
// SEO state. All five conditions must hold together — none alone (least
// of all `lang`, which the static shell's own <html lang="en"> can
// coincidentally already satisfy for an English page before hydration
// even starts) proves a real, page-specific prerender happened.
async function waitForHydratedSeo(page, entry, timeoutMs = 15000) {
  const expectedLang = entry.locale;
  const expectedDir = entry.locale === 'ar' ? 'rtl' : 'ltr';
  const expectedCanonical = canonicalUrlFor(entry);

  await page.waitForFunction(
    ({ expectedLang, expectedDir, expectedCanonical, shellTitle }) => {
      const html = document.documentElement;
      if (html.lang !== expectedLang) return false;
      if (html.dir !== expectedDir) return false;
      const title = document.title || '';
      if (!title || title === shellTitle) return false;
      const canonicalEl = document.querySelector('link[rel="canonical"]');
      if (!canonicalEl || canonicalEl.href !== expectedCanonical) return false;
      const main = document.querySelector('#main-content');
      if (!main || !main.textContent || main.textContent.trim().length === 0) return false;
      return true;
    },
    { expectedLang, expectedDir, expectedCanonical, shellTitle: SHELL_TITLE },
    { timeout: timeoutMs, polling: 100 },
  );
}

async function run() {
  const { chromium } = await import('playwright');
  let preview;

  try {
    // shell: true -- on Windows, spawn() cannot exec npx.cmd (a batch
    // file) directly without going through a shell; fails with EINVAL
    // otherwise. Harmless on POSIX too (goes through /bin/sh -c). Passed
    // as a single pre-built command string (no separate args array) so
    // this doesn't hit Node's DEP0190 warning, which only fires for the
    // (command, args[], {shell:true}) three-argument form; there is no
    // untrusted input in this string (PRERENDER_PORT is this script's own
    // internal default or an explicitly-set build-time env var, never
    // user/network input).
    preview = spawn(
      `npx vite preview --config vite.config.ts --host 127.0.0.1 --port ${PRERENDER_PORT} --strictPort`,
      { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, PORT: PRERENDER_PORT } },
    );

    await waitForServer(preview, PREVIEW_ORIGIN);

    const browser = await launchBrowser(chromium);
    try {
      const page = await browser.newPage();

      const ordered = [
        ...PRERENDER_MANIFEST.filter((e) => !(e.route === '/' && e.locale === 'en')),
        ...PRERENDER_MANIFEST.filter((e) => e.route === '/' && e.locale === 'en'),
      ];

      for (const entry of ordered) {
        const url = PREVIEW_ORIGIN + urlPathFor(entry);
        await page.goto(url, { waitUntil: 'load' });
        await waitForHydratedSeo(page, entry);

        const html = await page.content();
        const outRelPath = outputRelPathFor(entry);
        const outAbsPath = join(distDir, outRelPath);
        await mkdir(dirname(outAbsPath), { recursive: true });
        await writeFile(outAbsPath, html, 'utf8');
        console.log(`[prerender] wrote ${outRelPath}  (${entry.route} @ ${entry.locale})`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    killPreview(preview);
  }

  console.log(`[prerender] done: ${PRERENDER_MANIFEST.length} pages`);
}

run().catch((err) => {
  console.error('[prerender] FAILED:', err);
  process.exit(1);
});
