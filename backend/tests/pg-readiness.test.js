// lib/db/test/pg-readiness.mjs: the TCP readiness check every disposable-
// Postgres test harness uses instead of `docker exec pg_isready` (which can
// pass against the image's temporary socket-only init server). Fake clients
// and a fake clock: no Docker, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  waitForPostgresTcpReady, isTransientConnectionError, describeTarget, scrubSecrets,
} from '../../lib/db/test/pg-readiness.mjs';

const PASSWORD = 's3cr3t-Pa55word';
const URL_ = `postgres://postgres:${PASSWORD}@127.0.0.1:54321/alrahma_gate`;

const err = (message, code) => Object.assign(new Error(message), code ? { code } : {});
const TERMINATED = () => err('Connection terminated unexpectedly');
const RESET = () => err('read ECONNRESET', 'ECONNRESET');
const REFUSED = () => err(`connect ECONNREFUSED 127.0.0.1:54321 (${URL_})`, 'ECONNREFUSED');

// Each script entry is one attempt: 'ok', or a function returning the error
// thrown by connect(). Records every client and whether it was closed.
function fakeServer(script) {
  const clients = [];
  let i = 0;
  const createClient = (config) => {
    const step = i < script.length ? script[i] : script[script.length - 1];
    i += 1;
    const client = {
      config, ended: false, listeners: 0,
      on(event) { if (event === 'error') this.listeners += 1; },
      async connect() { if (step !== 'ok') throw step(); },
      async query(sql) { assert.equal(sql, 'SELECT 1 AS ready'); return { rows: [{ ready: 1 }] }; },
      async end() { this.ended = true; },
    };
    clients.push(client);
    return client;
  };
  return { createClient, clients };
}

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('socket-ready is not enough: with TCP refused every time it never reports ready, it times out', async () => {
  // A `pg_isready` over the container socket would already say "accepting
  // connections" here; the helper never consults it and keeps failing on TCP.
  const { createClient, clients } = fakeServer([REFUSED]);
  const clock = fakeClock();
  await assert.rejects(
    waitForPostgresTcpReady({ connectionString: URL_, createClient, label: 'pg-gate-1', timeoutMs: 5_000, pollMs: 500, ...clock }),
    (e) => {
      assert.match(e.message, /Postgres in container "pg-gate-1" \(postgres@127\.0\.0\.1:54321\/alrahma_gate\) was not ready over TCP within 5000ms after \d+ attempt\(s\)/);
      assert.match(e.message, /ECONNREFUSED/);
      assert.ok(!e.message.includes(PASSWORD), 'password must not leak');
      return true;
    }
  );
  assert.ok(clients.length >= 10);
  assert.ok(clients.every((c) => c.ended), 'every client closed');
});

test('"Connection terminated unexpectedly" is retried, then two consecutive successes are required', async () => {
  const { createClient, clients } = fakeServer([TERMINATED, TERMINATED, 'ok', 'ok']);
  const result = await waitForPostgresTcpReady({ connectionString: URL_, createClient, ...fakeClock() });
  assert.equal(result.attempts, 4);
  assert.equal(clients.length, 4);
  assert.ok(clients.every((c) => c.ended));
});

test('one success, then a reset, then two consecutive successes: the streak restarts after the reset', async () => {
  const { createClient } = fakeServer(['ok', RESET, 'ok', 'ok']);
  const clock = fakeClock();
  const result = await waitForPostgresTcpReady({ connectionString: URL_, createClient, pollMs: 500, settleMs: 250, ...clock });
  assert.equal(result.attempts, 4, 'the first lone success must not count');
  // 250 (after ok) + 500 (after reset) + 250 (after ok) = 1000 ms of waiting.
  assert.equal(result.elapsedMs, 1000);
});

test('a single success is not enough when the server restarts right after it', async () => {
  // ok, terminated, ok, terminated ... never two in a row -> times out.
  const { createClient } = fakeServer(['ok', TERMINATED, 'ok', TERMINATED, 'ok', TERMINATED, 'ok', TERMINATED]);
  await assert.rejects(
    waitForPostgresTcpReady({ connectionString: URL_, createClient, timeoutMs: 2_000, ...fakeClock() }),
    /was not ready over TCP within 2000ms/
  );
});

test('timeout: the error names container, host:port/db and attempts, and stops within the budget', async () => {
  const { createClient, clients } = fakeServer([RESET]);
  const clock = fakeClock();
  await assert.rejects(
    waitForPostgresTcpReady({ connectionString: URL_, createClient, label: 'pg-x', timeoutMs: 3_000, pollMs: 1_000, ...clock }),
    /container "pg-x" \(postgres@127\.0\.0\.1:54321\/alrahma_gate\).*within 3000ms after 4 attempt\(s\); last result: ECONNRESET/
  );
  assert.equal(clients.length, 4);
  assert.ok(clock.now() <= 3_000);
});

test('a non-transient error (wrong password) fails at once, without the password', async () => {
  const { createClient, clients } = fakeServer([() => err(`password authentication failed for user "postgres" (${URL_})`, '28P01')]);
  await assert.rejects(
    waitForPostgresTcpReady({ connectionString: URL_, createClient, label: 'pg-y', ...fakeClock() }),
    (e) => {
      assert.match(e.message, /non-transient error after 1 attempt\(s\): 28P01: password authentication failed/);
      assert.ok(!e.message.includes(PASSWORD));
      assert.match(e.message, /postgres:\/\/postgres:\*\*\*@127\.0\.0\.1:54321/);
      return true;
    }
  );
  assert.equal(clients.length, 1);
  assert.equal(clients[0].ended, true);
});

test('cleanup: every client gets an error listener and is ended, even when end() hangs', async () => {
  const clients = [];
  let n = 0;
  const createClient = () => {
    n += 1;
    const attempt = n;
    const client = {
      listeners: 0, endCalls: 0,
      on(event) { if (event === 'error') this.listeners += 1; },
      async connect() { if (attempt === 1) throw TERMINATED(); },
      async query() { return { rows: [{ ready: 1 }] }; },
      end() { this.endCalls += 1; return new Promise(() => {}); }, // never settles
    };
    clients.push(client);
    return client;
  };
  const result = await waitForPostgresTcpReady({ connectionString: URL_, createClient, closeTimeoutMs: 10, ...fakeClock() });
  assert.equal(result.attempts, 3);
  assert.ok(clients.every((c) => c.listeners === 1 && c.endCalls === 1));
});

test('an unexpected SELECT 1 result is not treated as ready', async () => {
  const createClient = () => ({
    on() {}, async connect() {}, async end() {},
    async query() { return { rows: [{ ready: 0 }] }; },
  });
  await assert.rejects(
    waitForPostgresTcpReady({ connectionString: URL_, createClient, ...fakeClock() }),
    /non-transient error after 1 attempt\(s\): EUNEXPECTED: SELECT 1 returned an unexpected result/
  );
});

test('the client is created with the exact connection string and a connect timeout', async () => {
  const { createClient, clients } = fakeServer(['ok', 'ok']);
  await waitForPostgresTcpReady({ connectionString: URL_, createClient, connectTimeoutMs: 1234, ...fakeClock() });
  assert.deepEqual(clients[0].config, { connectionString: URL_, connectionTimeoutMillis: 1234 });
});

test('classification and redaction helpers', () => {
  for (const e of [TERMINATED(), RESET(), REFUSED(), err('x', '57P03'), err('x', '08006'), err('timeout expired'),
    err('the database system is starting up')]) {
    assert.equal(isTransientConnectionError(e), true, e.message);
  }
  for (const e of [err('auth', '28P01'), err('no db', '3D000'), err('boom'), null]) {
    assert.equal(isTransientConnectionError(e), false);
  }
  assert.equal(describeTarget(URL_), 'postgres@127.0.0.1:54321/alrahma_gate');
  assert.equal(scrubSecrets(`failed for ${URL_} using ${PASSWORD}`, URL_), 'failed for postgres://postgres:***@127.0.0.1:54321/alrahma_gate using ***');
});

test('argument validation', async () => {
  await assert.rejects(waitForPostgresTcpReady({ createClient: () => ({}) }), /connectionString is required/);
  await assert.rejects(waitForPostgresTcpReady({ connectionString: URL_ }), /createClient is required/);
  await assert.rejects(waitForPostgresTcpReady({ connectionString: URL_, createClient: () => ({}), requiredSuccesses: 0 }), /requiredSuccesses must be >= 1/);
});
