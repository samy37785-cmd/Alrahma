// The SPA fallback shell (dist/public/spa-shell.html) that vercel.json's
// catch-all rewrite serves for every URL that has no prerendered file:
// unknown paths, routes not yet in PRERENDER_MANIFEST (e.g. /resources/blog,
// the Arabic tool pages), and the signed-in app (dashboard etc.).
//
// Why a separate file: prerender.mjs writes the English Home page over
// dist/public/index.html (last, see its own comment). When that file was
// also the fallback, every non-prerendered URL answered with Home's full
// content and `<link rel="canonical" href="/">`, so search engines saw an
// endless set of Home duplicates (a soft 404 for unknown paths).
//
// This shell is the untouched `vite build` index.html with three changes:
//   - robots becomes "noindex, follow": a crawler that reads the raw HTML
//     does not index the URL. A real visitor is unaffected: once React
//     renders, useSEO() sets the page's own robots value (and NotFound sets
//     noindex itself).
//   - the static canonical (Home) is removed: this shell is not Home.
//   - the static hreflang links (Home's) are removed for the same reason.
// The <title>, scripts and styles are unchanged, so the app boots exactly
// as before.

export const SPA_SHELL_FILE = 'spa-shell.html';
export const SPA_SHELL_ROBOTS = 'noindex, follow';

const ROBOTS_META_RE = /<meta\b[^>]*\bname=["']robots["'][^>]*>/i;
const CANONICAL_LINK_RE = /<link\b[^>]*\brel=["']canonical["'][^>]*>\s*/gi;
const HREFLANG_LINK_RE = /<link\b[^>]*\bhreflang=["'][^"']*["'][^>]*>\s*/gi;

export function buildSpaShell(indexHtml) {
  if (typeof indexHtml !== 'string' || !indexHtml.includes('</head>')) {
    throw new Error('buildSpaShell: expected the built index.html');
  }
  const robots = `<meta name="robots" content="${SPA_SHELL_ROBOTS}" />`;
  let html = indexHtml.replace(CANONICAL_LINK_RE, '').replace(HREFLANG_LINK_RE, '');
  html = ROBOTS_META_RE.test(html) ? html.replace(ROBOTS_META_RE, robots) : html.replace('</head>', `${robots}\n</head>`);
  return html;
}
