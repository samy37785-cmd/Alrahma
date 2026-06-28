import mongoose from 'mongoose';
import dns from 'node:dns';

// Force public DNS resolvers so mongodb+srv SRV lookups succeed in all environments.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Cache the connection across Serverless Function warm invocations
// AND across nodemon restarts (globalThis persists in the same process).
if (!globalThis._mongooseCache) {
  globalThis._mongooseCache = { conn: null, promise: null };
}
const cached = globalThis._mongooseCache;

export default async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is not set. Add it in Vercel → Settings → Environment Variables.');
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 6000,  // 6 s — leaves time for Express to respond before Vercel's 30 s timeout
      socketTimeoutMS: 30000,
      connectTimeoutMS: 6000,
    }).catch((err) => {
      cached.promise = null;           // reset so the next request retries
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log(`✅ MongoDB connected: ${cached.conn.connection.host}`);
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}
