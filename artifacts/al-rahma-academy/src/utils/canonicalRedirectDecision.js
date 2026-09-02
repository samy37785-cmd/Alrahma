// Stage 1 URL Closure (see docs/localization-audit.md): extracted from
// vite.config.ts's canonical-redirect middleware, same reason as
// isAssetOrApiPath.js - a Vite config file can't easily be
// imported/exercised by Vitest. This is the one place that decides IF a
// 308 should fire at all: never for a non-GET/HEAD method (a redirect
// must never be issued for POST/PUT/PATCH/DELETE, which this SPA-serving
// layer shouldn't see anyway since /api/* is excluded, but the guard is
// explicit rather than assumed), and never for an asset/API path.
import { isAssetOrApiPath } from './assetOrApiPath.js';
import { computeCanonicalUrl } from './urlCanonicalize.js';

export function computeCanonicalRedirect({ method, pathname, search = '' }) {
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (isAssetOrApiPath(pathname)) return null;
  return computeCanonicalUrl({ pathname, search });
}
