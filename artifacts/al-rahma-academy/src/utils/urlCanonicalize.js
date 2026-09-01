// Stage 1 URL Closure (see docs/localization-audit.md): single source of
// truth for what a "canonical" URL looks like on this app. Both the Vite
// dev/preview server middleware (vite.config.ts, Node context) and the
// pre-mount browser runtime fallback (main.jsx) call computeCanonicalUrl()
// with the same input shape and trust its output verbatim - neither
// re-implements any part of the decision, so the two can never drift.
//
// Deliberately has ZERO imports (not even from ../i18n or ./localePath) so
// it stays trivially importable from plain Node (vite.config.ts runs under
// Node, not through Vite's own React/JSX transform) without pulling in the
// full translation-dictionary chain that ../i18n/index.js re-exports just
// to get at its LANGS array.
//
// Mirrors the non-English half of ../i18n/index.js's LANGS as an
// independent literal (not imported), for the reason above. If a language
// is ever added/removed here, update both lists; a mismatch would only
// ever make this legacy-redirect logic conservative (skip inserting a
// prefix it doesn't recognize), never invent a wrong one - langFromPath in
// ./localePath.js remains the actual router-facing source of truth for
// what basename <BrowserRouter> mounts with.
const PREFIXED_LANGS = ['fr', 'it', 'ar', 'es', 'de'];

function splitSegments(pathname) {
  return pathname.split('/').filter(Boolean);
}

// Given the raw pathname + search (search either '' or a leading-'?'
// string, matching location.search's own convention) of an incoming
// request or browser URL, returns the canonical { pathname, search } - or
// null if the input is already canonical and no redirect is needed.
//
// Handles, in one pass (see docs/localization-audit.md for the full rule
// table and examples):
//   - legacy `?lang=xx` -> path-prefix migration (path prefix always wins
//     over the query value when both are present; `lang` is always
//     stripped from the query either way);
//   - an unsupported/empty `lang` value never invents a prefix;
//   - trailing-slash normalization: a language root (`/fr`) gets a
//     trailing slash, an internal path (`/courses/`) loses one;
//   - preserving every other query parameter, in its original order.
//
// Never touches `hash` - it isn't part of the input shape at all, since an
// HTTP server (the other caller of this function) never receives it.
export function computeCanonicalUrl({ pathname, search = '' }) {
  const segments = splitSegments(pathname);
  const firstSeg = segments[0];
  const pathLang = PREFIXED_LANGS.includes(firstSeg) ? firstSeg : null;
  const restSegments = pathLang ? segments.slice(1) : segments;

  const params = new URLSearchParams(search);
  const hadLangParam = params.has('lang');
  const queryLang = params.get('lang');
  params.delete('lang');

  // An existing path prefix is always the source of truth; a query
  // ?lang= is only ever consulted to INSERT a prefix onto an unprefixed
  // path - it can never override or duplicate one that's already there.
  const canonicalLang = pathLang || (PREFIXED_LANGS.includes(queryLang) ? queryLang : null);

  const isRoot = restSegments.length === 0;
  const canonicalPathname = isRoot
    ? (canonicalLang ? `/${canonicalLang}/` : '/')
    : (canonicalLang ? `/${canonicalLang}` : '') + `/${restSegments.join('/')}`;

  const canonicalQuery = params.toString();
  const canonicalSearch = canonicalQuery ? `?${canonicalQuery}` : '';

  const changed = canonicalPathname !== pathname || hadLangParam || canonicalSearch !== search;
  if (!changed) return null;

  return { pathname: canonicalPathname, search: canonicalSearch };
}

// Runtime-only convenience: reassembles a canonicalized { pathname, search }
// plus the original (always-preserved, never-inspected) hash into one URL
// string, for callers that need to hand a single string to
// window.location.replace().
export function formatCanonicalHref({ pathname, search = '' }, hash = '') {
  return pathname + search + hash;
}
