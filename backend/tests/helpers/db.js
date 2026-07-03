import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import connectDB from '../../config/db.js';

// A single-node replica set, not a plain standalone instance, because several
// code paths under test use mongoose.startSession()/withTransaction()
// (Stripe/PayPal webhooks, course-deletion cascade, cron reports would if
// they wrote across collections) — transactions require a replica set, and a
// standalone in-memory server would make those calls throw, testing nothing
// close to how MongoDB Atlas (the real, replica-set production database)
// actually behaves.
let replSet;

// Starts the in-memory replica set and points connectDB() at it. Safe against
// ever touching a real database: this always overwrites MONGO_URI, and
// connectDB() re-reads process.env.MONGO_URI at call time rather than caching
// whatever dotenv loaded from backend/.env at import time.
export async function setupTestDb() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    // The default 10s startup timeout is tight on a cold cache / busy machine
    // (first extraction of the mongod binary can take longer than that).
    instanceOpts: [{ launchTimeout: 30_000 }],
  });
  const uri = replSet.getUri();
  if (!uri.startsWith('mongodb://127.0.0.1') && !uri.startsWith('mongodb://localhost')) {
    throw new Error(`Refusing to run tests against a non-local MongoDB URI: ${uri}`);
  }
  process.env.MONGO_URI = uri;
  await connectDB();
}

// Drops every collection's documents between tests without tearing down the
// replica set (recreating it per test would be far slower). Leaves indexes
// and the replica set itself intact.
export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

export async function teardownTestDb() {
  await mongoose.disconnect();
  // The cached connection promise in config/db.js must be cleared too, or a
  // later test file's fresh replica set would be ignored in favor of this
  // (now-stopped) one -- irrelevant across separate `node --test` worker
  // processes, but harmless and correct to reset regardless.
  globalThis._mongooseCache = { conn: null, promise: null };
  if (replSet) await replSet.stop();
}
