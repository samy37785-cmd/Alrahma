import mongoose from 'mongoose';
import dns from 'node:dns';
import logger from './logger.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);

if (!globalThis._mongooseCache) {
  globalThis._mongooseCache = { conn: null, promise: null };
}
const cached = globalThis._mongooseCache;

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
