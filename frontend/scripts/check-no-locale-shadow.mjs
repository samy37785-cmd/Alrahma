/**
 * Prebuild guard against a real, previously-shipped bug: a static file under
 * frontend/public/<lang>/... gets copied into dist/ verbatim by `vite build`
 * BEFORE scripts/prerender.mjs runs, and both `vite preview` and Vercel
 * resolve an exact static file before the SPA catch-all — so such a file
 * silently shadows (and, since prerender.mjs's own capture navigates through
 * the live preview server, self-perpetuates) whatever the real SPA would
 * otherwise render for that route. frontend/public/fr/index.html and
 * public/it/index.html were exactly this: legacy Phase-1 static landing
 * pages at the same URL as the SPA's homepage, silently never running React
 * at all despite every build "successfully" prerendering over them. Removed
 * in the Phase 2 routing-fix pass; this script fails the build fast, before
 * the ~9-minute prerender step even starts, if anything like it reappears.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS } from '../src/i18n/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const offenders = LANGS.filter((lang) => lang !== 'en').filter((lang) =>
  existsSync(join(publicDir, lang)),
);

if (offenders.length > 0) {
  console.error(
    `[check-no-locale-shadow] FAILED — frontend/public/${offenders.join(', frontend/public/')} exist. ` +
    'A locale subdirectory under public/ is copied into dist/ by `vite build` before scripts/prerender.mjs ' +
    'runs, and will silently shadow every prerendered file this script would otherwise generate for that ' +
    'language. Remove it — the real SPA (via scripts/prerender.mjs) already generates a correct, ' +
    'fully-translated file for every route in that language.',
  );
  process.exit(1);
}

console.log('[check-no-locale-shadow] OK — no locale-shadow directories under public/.');
