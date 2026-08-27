// Shared by http.js and adminHttp.js — both axios instances need to read the
// same csrf_token cookie and echo it back as the X-CSRF-Token header on
// mutating requests (double-submit cookie pattern, see backend/middleware/
// csrf.js). Kept in one place so the cookie/header name can never drift out
// of sync between the two instances.
export function getCsrfToken() {
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='))
      ?.split('=')[1] ?? ''
  );
}

// The backend only ever *sets* csrf_token on a response (issueCsrfToken), so
// a visitor whose first-ever request to the API is a mutation — e.g. landing
// directly on /login or /register with no earlier page having called the
// backend — has no cookie to echo back yet, and verifyCsrfToken rejects that
// same request with "CSRF token missing" before one can arrive. Both http.js
// and adminHttp.js call this before attaching the header on a mutating
// request; it's a no-op once the cookie already exists. `inflight` makes
// concurrent first mutations (e.g. a double-click) share one warm-up call
// instead of each firing their own.
let inflight = null;

export async function ensureCsrfToken() {
  if (getCsrfToken()) return;
  const baseURL = import.meta.env.VITE_API_URL || '/api';
  if (!inflight) {
    inflight = fetch(`${baseURL}/csrf`, { credentials: 'include' })
      .catch(() => {})
      .finally(() => { inflight = null; });
  }
  await inflight;
}
