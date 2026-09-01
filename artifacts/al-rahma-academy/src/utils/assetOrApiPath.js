// Stage 1 URL Closure (see docs/localization-audit.md): extracted from
// vite.config.ts's canonical-redirect middleware so it's unit-testable on
// its own (a Vite config file can't easily be imported/exercised by
// Vitest). A request whose last path segment carries a file extension
// (assets, favicon.svg, robots.txt, sitemap.xml, ...) or that targets
// /api/* must never be touched by the trailing-slash/legacy-lang
// canonical-redirect middleware - only actual app routes that serve
// index.html are in scope for that.
export function isAssetOrApiPath(pathname) {
  if (pathname.startsWith('/api/')) return true;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return /\.[a-zA-Z0-9]+$/.test(lastSegment);
}
