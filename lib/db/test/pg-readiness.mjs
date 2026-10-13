// Readiness check for the disposable Docker Postgres every test harness in
// this repo starts. Dependency-free on purpose (like orchestrator-lib.mjs):
// each caller passes its own `pg` client factory.
//
// Why not `docker exec <c> pg_isready`: that probes the Unix socket inside
// the container. The official postgres image first runs a TEMPORARY server
// (socket only, no TCP) to apply POSTGRES_DB/init scripts, then shuts it
// down and starts the real one. pg_isready can answer "ready" from the
// temporary server; a harness that then connects over TCP lands in the
// shutdown/restart window and gets "Connection terminated unexpectedly" /
// ECONNRESET. See backend/tests/contract/http-contract-gate-last-run.md.
//
// Protocol: connect over TCP to the exact connection string the test will
// use, run SELECT 1, close the client. Ready only after `requiredSuccesses`
// CONSECUTIVE successes `settleMs` apart (a single success can still come
// from a server about to restart). Transient connection errors reset the
// streak and retry until the total `timeoutMs`; any other error (bad
// password, missing database, ...) fails at once. Error messages name the
// container, host, port, database and attempt count, never the password.

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Errors that mean "not accepting connections yet / connection dropped".
const TRANSIENT_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH', 'EAI_AGAIN',
  '57P03', // cannot_connect_now: the database system is starting up / shutting down
  '57P01', // admin_shutdown: terminating connection due to administrator command
]);
const TRANSIENT_MESSAGES = [
  /connection terminated/i,
  /timeout expired/i,
  /the database system is (starting up|shutting down|in recovery mode)/i,
  /server closed the connection unexpectedly/i,
  /socket hang up/i,
];

export function isTransientConnectionError(err) {
  if (!err) return false;
  if (err.code && TRANSIENT_CODES.has(err.code)) return true;
  if (typeof err.code === 'string' && err.code.startsWith('08')) return true; // SQLSTATE class 08: connection exception
  const message = String(err.message || '');
  return TRANSIENT_MESSAGES.some((re) => re.test(message));
}

// "postgres@127.0.0.1:54321/dbname" — the target without the password.
export function describeTarget(connectionString) {
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || '(default)';
  return `${decodeURIComponent(url.username) || '(default user)'}@${url.hostname}:${url.port || '5432'}/${database}`;
}

// Removes the password (and any user:pass@ pair) from a message.
export function scrubSecrets(text, connectionString) {
  let out = String(text ?? '');
  try {
    const password = decodeURIComponent(new URL(connectionString).password);
    if (password) out = out.split(password).join('***');
  } catch {
    // not a parseable URL: the generic pattern below still applies
  }
  return out.replace(/(postgres(?:ql)?:\/\/[^:/@\s]*):[^@\s]*@/gi, '$1:***@');
}

function describeError(err, connectionString) {
  const code = err && err.code ? `${err.code}: ` : '';
  return scrubSecrets(`${code}${(err && err.message) || String(err)}`, connectionString);
}

// Bounded close with its own timer: a hung end() must not block the harness,
// and closing must not eat into the readiness budget.
async function closeQuietly(client, closeTimeoutMs) {
  if (!client || typeof client.end !== 'function') return;
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => client.end()),
      new Promise((resolve) => { timer = setTimeout(resolve, closeTimeoutMs); }),
    ]);
  } catch {
    // closing a client that never connected (or already dropped) may throw
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForPostgresTcpReady({
  connectionString,
  createClient,
  label = 'postgres',
  timeoutMs = 60_000,
  pollMs = 500,
  requiredSuccesses = 2,
  settleMs = 250,
  connectTimeoutMs = 3_000,
  closeTimeoutMs = 2_000,
  now = Date.now,
  sleep = defaultSleep,
} = {}) {
  if (typeof connectionString !== 'string' || !connectionString) throw new Error('waitForPostgresTcpReady: connectionString is required');
  if (typeof createClient !== 'function') throw new Error('waitForPostgresTcpReady: createClient is required');
  if (!(requiredSuccesses >= 1)) throw new Error('waitForPostgresTcpReady: requiredSuccesses must be >= 1');

  const target = describeTarget(connectionString);
  const started = now();
  const deadline = started + timeoutMs;
  let attempts = 0;
  let streak = 0;
  let lastError = null;

  while (true) {
    attempts += 1;
    let client = null;
    try {
      client = createClient({ connectionString, connectionTimeoutMillis: connectTimeoutMs });
      // A server restarting mid-check makes pg emit 'error' on the client;
      // without a listener that would crash the harness instead of retrying.
      if (typeof client.on === 'function') client.on('error', () => {});
      await client.connect();
      const result = await client.query('SELECT 1 AS ready');
      if (!result || !Array.isArray(result.rows) || result.rows[0]?.ready !== 1) {
        throw Object.assign(new Error('SELECT 1 returned an unexpected result'), { code: 'EUNEXPECTED' });
      }
      streak += 1;
      lastError = null;
    } catch (err) {
      streak = 0;
      lastError = err;
      if (!isTransientConnectionError(err)) {
        throw new Error(
          `Postgres in container "${label}" (${target}) refused the readiness check with a non-transient error ` +
          `after ${attempts} attempt(s): ${describeError(err, connectionString)}`
        );
      }
    } finally {
      await closeQuietly(client, closeTimeoutMs);
    }

    if (streak >= requiredSuccesses) return { attempts, elapsedMs: now() - started };

    const wait = streak > 0 ? settleMs : pollMs;
    if (now() + wait > deadline) {
      const why = lastError ? describeError(lastError, connectionString) : `only ${streak} of ${requiredSuccesses} consecutive successes`;
      throw new Error(
        `Postgres in container "${label}" (${target}) was not ready over TCP within ${timeoutMs}ms ` +
        `after ${attempts} attempt(s); last result: ${why}`
      );
    }
    await sleep(wait);
  }
}
