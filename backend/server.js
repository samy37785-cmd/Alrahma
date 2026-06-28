// Local development entry point — NOT used by Vercel.
// Vercel uses api/index.js which imports server/app.js directly.
import app from './app.js';
import connectDB from './config/db.js';

// Connect eagerly at startup so the first request isn't slow.
connectDB().catch((err) => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
