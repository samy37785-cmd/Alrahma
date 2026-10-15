import { builtDistStatus, DIST_PUBLIC } from '../../../scripts/buildFingerprint.mjs';

export { DIST_PUBLIC };

// True when dist/public is a finished prerender of the current checkout (see
// scripts/buildFingerprint.mjs). The plain `vitest run` (no build yet) skips
// the dist-reading blocks; `pnpm run test:prerender` sets
// REQUIRE_PRERENDER_DIST=1 and turns a missing, partial or stale build into a
// failure, so CI can never pass them by skipping.
export function builtDistReady(label) {
  const { ready, reason } = builtDistStatus();
  if (ready) return true;
  if (process.env.REQUIRE_PRERENDER_DIST === '1') {
    throw new Error(`[${label}] ${reason}: run \`pnpm run build\` before \`pnpm run test:prerender\``);
  }
  console.warn(`[${label}] ${reason}; dist-based tests skipped (run \`pnpm run build\`, then \`pnpm run test:prerender\`)`);
  return false;
}
