import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';

// T23 (monitoring & observability audit): /ready previously resolved purely
// from connectDB()'s cached connection object, which — once ever connected —
// never re-checks the connection is still live (see config/db.js). That made
// /ready structurally unable to ever report "not ready" after the first
// successful connect, defeating the readiness probe's own documented purpose
// ("is the service ready to handle requests? ... so a container orchestrator
// can hold traffic until the DB is reachable"). The fix additionally checks
// mongoose.connection.readyState.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });

test('GET /ready reports ready while the database connection is live', async () => {
  assert.equal(mongoose.connection.readyState, 1); // sanity: actually connected
  const res = await request(app).get('/ready');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ready');
});

test('GET /ready reports 503 once the database connection has dropped, even though it connected successfully earlier', async () => {
  await mongoose.disconnect();
  try {
    assert.notEqual(mongoose.connection.readyState, 1); // sanity: actually disconnected
    const res = await request(app).get('/ready');
    assert.equal(res.status, 503);
    assert.equal(res.body.status, 'not ready');
  } finally {
    // Reconnect so teardownTestDb() (and any test file run after this one in
    // the same process) still sees a normal connection to tear down.
    globalThis._mongooseCache = { conn: null, promise: null };
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 6000 });
  }
});
