// The two fallback documents vercel.json relies on for URLs that have no
// prerendered file. Both are built from the untouched `vite build`
// index.html, so the app boots exactly as before (same title, scripts,
// styles and #root loading state).
//
// Why not index.html: prerender.mjs writes the English Home page over
// dist/public/index.html (last, see its own comment). When that file was
// the fallback, every non-prerendered URL answered with Home's full content
// and `<link rel="canonical" href="/">`: an endless set of Home duplicates.
//
// spa-shell.html — a REAL app route that is not prerendered (yet), e.g.
//   /resources/blog, /enroll, /ar/enroll, the en/ar tool pages, the signed-in
//   app. vercel.json rewrites only the route patterns App.jsx actually
//   defines to this file. Home's canonical and hreflang are removed (this is
//   not Home); robots is left as the source has it (index), NOT noindex:
//   once React renders, useSEO() writes the page's own title, description,
//   canonical and robots, so these routes stay indexable from the rendered
//   page and can be prerendered later without undoing anything here.
//
// 404.html — every other URL. No rewrite matches it, so Vercel answers with
//   this file and HTTP 404. It is the same shell plus robots noindex; the
//   app still boots and renders NotFound (which also sets noindex).

export const SPA_SHELL_FILE = 'spa-shell.html';
export const NOT_FOUND_FILE = '404.html';
export const NOT_FOUND_ROBOTS = 'noindex, follow';

const ROBOTS_META_RE = /<meta\b[^>]*\bname=["']robots["'][^>]*>/i;
const CANONICAL_LINK_RE = /<link\b[^>]*\brel=["']canonical["'][^>]*>\s*/gi;
const HREFLANG_LINK_RE = /<link\b[^>]*\bhreflang=["'][^"']*["'][^>]*>\s*/gi;

function assertIndexHtml(indexHtml) {
  if (typeof indexHtml !== 'string' || !indexHtml.includes('</head>')) {
    throw new Error('spaShell: expected the built index.html');
  }
}

// Shell for real, not-yet-prerendered app routes: not Home, still indexable.
export function buildSpaShell(indexHtml) {
  assertIndexHtml(indexHtml);
  return indexHtml.replace(CANONICAL_LINK_RE, '').replace(HREFLANG_LINK_RE, '');
}

// Body of the HTTP 404 response for unknown URLs: the same shell, noindex.
export function buildNotFoundPage(indexHtml) {
  const html = buildSpaShell(indexHtml);
  const robots = `<meta name="robots" content="${NOT_FOUND_ROBOTS}" />`;
  return ROBOTS_META_RE.test(html) ? html.replace(ROBOTS_META_RE, robots) : html.replace('</head>', `${robots}\n</head>`);
}
