/* global __BUILD_COMMIT__ */
// The commit this website build was made from, or null when unknown.
// vite.config.ts fills __BUILD_COMMIT__ from VERCEL_GIT_COMMIT_SHA during
// Vercel builds; local builds, the dev server and tests have none.
const raw = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '';

export const BUILD_COMMIT = /^[0-9a-f]{7,40}$/i.test(raw) ? raw.toLowerCase() : null;
