// Stage 1 URL Closure (see docs/localization-audit.md): the pre-mount
// runtime fallback. A legacy `?lang=fr` link, or a non-canonical URL that
// no server 308 caught (e.g. a static host that doesn't run our Vite
// middleware), must never flash the English page or a NotFound before
// landing on its canonical URL. This runs BEFORE React is created/mounted
// - not inside a component or effect - so there is nothing to flash.
import { computeCanonicalUrl, formatCanonicalHref } from './urlCanonicalize.js';

// Pure decision function, kept separate from the actual window.location
// side effect below so it's testable without touching `window` at all.
// Returns the full href to redirect to, or null if the current location is
// already canonical.
export function decideBootRedirect({ pathname, search = '', hash = '' }) {
  const canonical = computeCanonicalUrl({ pathname, search });
  if (!canonical) return null;
  return formatCanonicalHref(canonical, hash);
}

// Applies the decision against a real (or test-double) `window`-like
// object. Returns true if a redirect was issued - callers must stop before
// creating a React root in that case. Uses replace(), never assign(), so
// the legacy URL never enters session history (no back-button trap, no
// redirect loop even if a caller misused this on every render - it isn't
// called on every render, only once at boot).
export function runBootRedirect(win = window) {
  const href = decideBootRedirect({
    pathname: win.location.pathname,
    search: win.location.search,
    hash: win.location.hash,
  });
  if (href === null) return false;
  win.location.replace(href);
  return true;
}
