// Audit AR-18: password-reset links carry the token in the fragment
// (#token=…), which the browser never sends to a server, so it stays out of
// request logs. Links emailed before that change use ?token=… and still work.
export function readResetToken(loc = window.location) {
  return new URLSearchParams(loc.hash.replace(/^#/, '')).get('token')
    || new URLSearchParams(loc.search).get('token')
    || '';
}
