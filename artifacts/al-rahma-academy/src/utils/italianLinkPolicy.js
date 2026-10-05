// Italian internal-link policy.
//
// The Italian UI must not expose a crawlable link to a route whose Italian page
// is not published: those URLs are not prerendered, so they answer with the SPA
// shell (canonical "/", lang "en") and leak crawl budget. Each route below gets
// its own content/SEO gate before it is published; when that happens it must be
// removed from this list (src/test/italianInternalLinks.test.jsx fails if a
// published route is still listed).
export const IT_HIDDEN_ROUTES = Object.freeze([
  '/tools/qibla',
  '/tools/islamic-calendar',
  '/resources/blog',
  '/login',
]);

/** True when `route` (app-relative, no language prefix) must not be linked in `lang`. */
export const isRouteHidden = (lang, route) => lang === 'it' && IT_HIDDEN_ROUTES.includes(route);

/**
 * The "open the Quran reader" button used to point at /tools/quran, a client-side
 * redirect that has no Italian page of its own. Italian links straight to the
 * published reader; other languages keep their existing link.
 */
export const quranReaderRoute = (lang) => (lang === 'it' ? '/tools/quran-reader' : '/tools/quran');
