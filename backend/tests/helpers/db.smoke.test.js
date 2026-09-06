import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setupTestDb, clearTestDb, teardownTestDb } from './db.js';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });

test('connects to the in-memory replica set and can read/write', async () => {
  assert.equal(mongoose.connection.readyState, 1); // 1 = connected
  const Scratch = mongoose.model('__Scratch', new mongoose.Schema({ n: Number }));
  await Scratch.create({ n: 1 });
  assert.equal(await Scratch.countDocuments(), 1);
});

test('transactions work (requires a real replica set, not a standalone)', async () => {
  const Scratch = mongoose.model('__Scratch');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Scratch.create([{ n: 2 }], { session });
    });
  } finally {
    session.endSession();
  }
  assert.equal(await Scratch.countDocuments(), 2);
});

test('clearTestDb wipes documents between tests', async () => {
  await clearTestDb();
  const Scratch = mongoose.model('__Scratch');
  assert.equal(await Scratch.countDocuments(), 0);
});
