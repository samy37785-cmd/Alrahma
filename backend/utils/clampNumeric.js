// Coerces a request-supplied numeric field to a safe, bounded non-negative
// number — `Number(x) || 0` alone (the previous guard on the Quran
// stats/progress log endpoints) only protects against NaN, not a negative
// value (which would silently decrement a counter) or an absurdly large one
// (e.g. Number.MAX_SAFE_INTEGER, corrupting streak/history stats).
export function clampNonNegative(value, max) {
  return Math.min(Math.max(Number(value) || 0, 0), max);
}
