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
