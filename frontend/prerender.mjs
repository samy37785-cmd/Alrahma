// Post-build prerendering step.
//
// react-snap ships an ancient, broken puppeteer (its bundled Chromium fails to
// launch). We keep react-snap's crawler but point it at the modern, maintained
// Chromium that the `puppeteer` devDependency downloads. The path is resolved
// at runtime so this works both locally and in Vercel's build container.
import { readFileSync } from 'node:fs';
import reactSnap from 'react-snap';
import puppeteer from 'puppeteer';

const { run } = reactSnap;
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

const config = {
  ...pkg.reactSnap,
  puppeteerExecutablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
};

run(config)
  .then(() => process.exit(0))
  .catch((err) => {
    // Best-effort: never break the deploy. If Chromium can't launch (e.g. a
    // download hiccup in the build container), ship the normal SPA build for
    // this deploy instead of failing. SEO prerendering simply won't apply
    // until the next successful build.
    console.warn(
      '\n⚠️  Prerendering skipped — Chromium could not launch. ' +
        'Shipping the standard SPA build.\n' +
        '   On Windows this is usually Defender blocking the download; ' +
        'set PUPPETEER_EXECUTABLE_PATH to a local Chrome/Edge to test locally.\n',
    );
    console.warn(String(err && err.message ? err.message : err));
    process.exit(0);
  });
