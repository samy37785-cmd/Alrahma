import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';

// T23 (monitoring & observability audit): previously nothing logged a runtime
// MongoDB disconnect/reconnect/error once the initial connect succeeded — a
// later network blip or Atlas maintenance event would go unnoticed until some
// unrelated query timed out. Verifies the listeners are attached, fire on the
// real connection events, and are registered exactly once even though
// connectDB() (and this test's own setup) can run many times per process.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });

test('connectDB() registers exactly one disconnected/reconnected/error listener, even when called repeatedly', async () => {
  await connectDB();
  await connectDB();
  await connectDB();
  assert.equal(mongoose.connection.listenerCount('disconnected'), 1);
  assert.equal(mongoose.connection.listenerCount('reconnected'), 1);
  assert.equal(mongoose.connection.listenerCount('error'), 1);
});

test('a "disconnected" event logs a warning without throwing', () => {
  assert.doesNotThrow(() => mongoose.connection.emit('disconnected'));
});
