// JWKS migration for admin Supabase-session verification — proves
// data/supabase/supabaseSessionCookie.js's verifySupabaseToken()/
// isVerifiedAal2() correctly verify GoTrue access tokens against a
// project's JWKS endpoint when SUPABASE_JWT_SECRET is unset, and that the
// legacy HS256 path (SUPABASE_JWT_SECRET set) still works unchanged.
//
// Every JWKS case here is fully offline: a real Node http server bound to
// 127.0.0.1 stands in for Supabase's
// SUPABASE_URL/auth/v1/.well-known/jwks.json endpoint (same "serve on
// loopback only" pattern tests/server-startup-backend-selection.test.js
// already uses for server.js itself), with temporary ES256 keypairs
// generated fresh per test. No call ever leaves localhost; nothing here
// talks to a real Supabase project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

import { verifySupabaseToken, isVerifiedAal2 } from '../data/supabase/supabaseSessionCookie.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const serverPath = path.join(backendRoot, 'server.js');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Temporarily overrides process.env keys, restoring the previous values
// (or absence) afterward — so tests never leak env state into each other
// or into a real value this process happened to inherit from the shell.
async function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  for (const k of keys) {
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

// Stands in for a real Supabase project's own JWKS endpoint. Publishes TWO
// ES256 keys (the real signing key, plus a second unused decoy key) so that
// a token omitting `kid` is genuinely ambiguous and must be rejected, rather
// than trivially resolving because it's the only key of that algorithm in
// the set — real Supabase JWKS endpoints publish multiple keys during key
// rotation, so this is the realistic shape to test against.
async function startJwksFixture() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const kid = 'test-key-1';
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'ES256';

  const { publicKey: decoyPublicKey } = await generateKeyPair('ES256', { extractable: true });
  const decoyJwk = await exportJWK(decoyPublicKey);
  decoyJwk.kid = 'test-key-2-unused';
  decoyJwk.use = 'sig';
  decoyJwk.alg = 'ES256';

  const jwks = { keys: [publicJwk, decoyJwk] };

  const server = createHttpServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(jwks));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const port = await getFreePort();
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const supabaseUrl = `http://127.0.0.1:${port}`;
  const issuer = `${supabaseUrl}/auth/v1`;

  async function sign(claims, { key = privateKey, kidHeader = kid, issuerClaim = issuer, expiresIn = '15m' } = {}) {
    const header = kidHeader ? { alg: 'ES256', kid: kidHeader } : { alg: 'ES256' };
    let builder = new SignJWT(claims).setProtectedHeader(header).setIssuedAt().setExpirationTime(expiresIn);
    if (issuerClaim) builder = builder.setIssuer(issuerClaim);
    return builder.sign(key);
  }

  return {
    supabaseUrl,
    issuer,
    kid,
    sign,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function withJwksFixture(fn) {
  const fixture = await startJwksFixture();
  try {
    await fn(fixture);
  } finally {
    await fixture.close();
  }
}

test('JWKS: a valid ES256 token signed by the published key verifies, with the real aal2 claim', async () => {
  await withJwksFixture(async ({ supabaseUrl, sign }) => {
    await withEnv({ SUPABASE_URL: supabaseUrl, SUPABASE_JWT_SECRET: undefined }, async () => {
      const token = await sign({ sub: 'admin-1', aal: 'aal2' });
      const claims = await verifySupabaseToken(token);
      assert.ok(claims, 'expected the valid JWKS-signed token to verify');
      assert.equal(claims.sub, 'admin-1');
      assert.equal(claims.aal, 'aal2');
      assert.equal(await isVerifiedAal2(token, 'admin-1'), true);
      assert.equal(await isVerifiedAal2(token, 'a-different-admin'), false, 'sub mismatch must not count as verified');
    });
  });
});

test('JWKS: a token forged with an unrelated keypair (masquerading as the real kid) fails verification', async () => {
  await withJwksFixture(async ({ supabaseUrl, kid, sign }) => {
    await withEnv({ SUPABASE_URL: supabaseUrl, SUPABASE_JWT_SECRET: undefined }, async () => {
      const { privateKey: attackerKey } = await generateKeyPair('ES256', { extractable: true });
      const forged = await sign({ sub: 'admin-1', aal: 'aal2' }, { key: attackerKey, kidHeader: kid });
      assert.equal(await verifySupabaseToken(forged), null);
      assert.equal(await isVerifiedAal2(forged, 'admin-1'), false);
    });
  });
});

test('JWKS: a token with the wrong issuer is rejected even though its signature is genuine', async () => {
  await withJwksFixture(async ({ supabaseUrl, sign }) => {
    await withEnv({ SUPABASE_URL: supabaseUrl, SUPABASE_JWT_SECRET: undefined }, async () => {
      const wrongIssuer = await sign(
        { sub: 'admin-1', aal: 'aal2' },
        { issuerClaim: 'http://127.0.0.1:1/auth/v1' },
      );
      assert.equal(await verifySupabaseToken(wrongIssuer), null);
    });
  });
});

test('JWKS: a token with no kid header, or an unknown kid, is rejected', async () => {
  await withJwksFixture(async ({ supabaseUrl, sign }) => {
    await withEnv({ SUPABASE_URL: supabaseUrl, SUPABASE_JWT_SECRET: undefined }, async () => {
      const noKid = await sign({ sub: 'admin-1', aal: 'aal2' }, { kidHeader: null });
      assert.equal(await verifySupabaseToken(noKid), null);

      const unknownKid = await sign({ sub: 'admin-1', aal: 'aal2' }, { kidHeader: 'not-a-real-key-id' });
      assert.equal(await verifySupabaseToken(unknownKid), null);
    });
  });
});

test('Legacy HS256: SUPABASE_JWT_SECRET set still verifies a matching HS256 token (regression)', async () => {
  await withEnv({ SUPABASE_JWT_SECRET: 'local-only-test-hs256-secret', SUPABASE_URL: 'http://127.0.0.1:1' }, async () => {
    const token = jwt.sign({ sub: 'admin-1', aal: 'aal2' }, 'local-only-test-hs256-secret', {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    const claims = await verifySupabaseToken(token);
    assert.ok(claims, 'expected the legacy HS256 path to keep working when SUPABASE_JWT_SECRET is set');
    assert.equal(claims.aal, 'aal2');
    assert.equal(await isVerifiedAal2(token, 'admin-1'), true);
  });
});

test('Legacy HS256: a token signed with the wrong secret is still rejected (regression)', async () => {
  await withEnv({ SUPABASE_JWT_SECRET: 'local-only-test-hs256-secret', SUPABASE_URL: 'http://127.0.0.1:1' }, async () => {
    const token = jwt.sign({ sub: 'admin-1', aal: 'aal2' }, 'a-different-secret', { algorithm: 'HS256' });
    assert.equal(await verifySupabaseToken(token), null);
  });
});

// ── Boot-level proof: Supabase mode starts and serves /health with no
// SUPABASE_JWT_SECRET at all — real subprocess boot, same pattern as
// tests/server-startup-backend-selection.test.js (server.js has real
// process-level side effects, so it is spawned as a genuine child process
// rather than imported into this test file's own process).
function buildSupabaseBootEnv(port) {
  const env = { ...process.env };
  delete env.RENDER_EXTERNAL_URL;
  delete env.MONGO_URI;
  delete env.SUPABASE_JWT_SECRET;
  Object.assign(env, {
    DATA_BACKEND: 'supabase',
    JWT_SECRET: 'local-only-test-secret',
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_ANON_KEY: 'local-only-dummy-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'local-only-dummy-service-role-key',
    SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder',
    PORT: String(port),
  });
  return env;
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res.json();
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw lastErr || new Error('timed out waiting for /health');
}

function killAndWait(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
  });
}

test('DATA_BACKEND=supabase boots and /health responds with no SUPABASE_JWT_SECRET and no MONGO_URI', async () => {
  const port = await getFreePort();
  const env = buildSupabaseBootEnv(port);
  assert.equal(env.SUPABASE_JWT_SECRET, undefined, 'test setup sanity check');
  const child = spawn(process.execPath, [serverPath], { cwd: backendRoot, env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  try {
    // Generous timeout: running alongside this file's other tests (JWKS
    // crypto + local fixture HTTP servers) in the same node --test process
    // showed real, non-bug slowdown under Windows process-spawn contention
    // — confirmed by running this exact spawn logic in isolation (fast,
    // ~4s) vs. within the full suite (timed out at 20s) — same finding as
    // tests/server-startup-backend-selection.test.js's own timeout comments.
    const body = await waitForHealth(port, 45_000).catch((err) => {
      throw new Error(`/health never responded with no SUPABASE_JWT_SECRET set. stdout: ${stdout} stderr: ${stderr}. Original: ${err.message}`);
    });
    assert.equal(body.status, 'ok');
  } finally {
    await killAndWait(child);
  }
});
