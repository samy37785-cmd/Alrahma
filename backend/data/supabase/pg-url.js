// Query parameters of a Postgres URL that change WHICH SERVER pg connects to.
// pg merges every query parameter over its own config, so
//   postgresql://u:pw@127.0.0.1/db?host=db.example.test
// connects to db.example.test while anything that reads only the URL's
// authority (a "is this local?" guard, a "is this the production project?"
// check, the strict-TLS switch) still sees 127.0.0.1. `hostaddr` is the
// libpq spelling of the same override. Pure: no I/O, never logs the URL.
const HOST_OVERRIDE_PARAMS = new Set(['host', 'hostaddr']);

/** The host-overriding parameter names (lowercased) the URL carries, or [] (also for an unparseable value). */
export function hostOverrideParams(uri) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    return [];
  }
  return [...new Set([...url.searchParams.keys()].map((k) => k.toLowerCase()).filter((k) => HOST_OVERRIDE_PARAMS.has(k)))];
}

export function hasHostOverride(uri) {
  return hostOverrideParams(uri).length > 0;
}

/** The refusal message. Names no URL, host, user or password. */
export const HOST_OVERRIDE_MESSAGE =
  'the Postgres connection string carries a host/hostaddr query parameter, which would send the connection to a server other than ' +
  'the host in the URL; put the real host in the URL itself and remove the parameter';
