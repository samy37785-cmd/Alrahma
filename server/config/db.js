import mongoose from 'mongoose';
import dns from 'node:dns';

// Some local/ISP DNS resolvers refuse the SRV lookups that "mongodb+srv://"
// connection strings rely on. Forcing a public resolver avoids that failure.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Connects to MongoDB. Called once at server startup.
export default async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host} (db: ${conn.connection.name})`);
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    process.exit(1); // stop the app if DB fails
  }
}
