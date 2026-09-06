import mongoose from 'mongoose';
import dns from 'node:dns';
import logger from './logger.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);

if (!globalThis._mongooseCache) {
  globalThis._mongooseCache = { conn: null, promise: null };
}
const cached = globalThis._mongooseCache;

// Runtime connection-state visibility: once the initial connect() above
// succeeds, mongoose keeps reusing that same connection object for the rest
// of the process's life — a later network blip or Atlas maintenance event
// would previously go completely unlogged until some unrelated query timed
// out. These listeners are registered once per process (guarded so repeated
// connectDB() calls / test-file re-imports don't stack up duplicate
// listeners) and only log; they don't alter reconnection behavior, which
// mongoose's driver already handles internally.
if (!globalThis._mongooseConnectionLoggingAttached) {
  globalThis._mongooseConnectionLoggingAttached = true;
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB connection lost'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB connection restored'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { message: err.message }));
}

export default async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is not set.');
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 6000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 6000,
    }).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
    logger.info(`MongoDB connected: ${cached.conn.connection.host}`);
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}
