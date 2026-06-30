// Local development entry point — NOT used in production.
// Production: Render runs "node server.js" directly (see render.yaml).
import app from './app.js';
import connectDB from './config/db.js';
import { startKeepAlive } from './config/keepAlive.js';
import logger from './config/logger.js';

// Connect eagerly at startup so the first request isn't slow.
connectDB().catch((err) => {
  logger.error('MongoDB connection failed at startup', { message: err.message });
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`, { env: process.env.NODE_ENV || 'development' });
  startKeepAlive();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// On SIGTERM (container stop, Render deploy) or SIGINT (Ctrl+C) we stop
// accepting new connections, wait for in-flight requests to finish (up to 10 s),
// then exit cleanly.  Without this, abrupt termination can corrupt in-flight
// payment or database writes.
let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);
  server.close((err) => {
    if (err) {
      logger.error('Error during server close', { message: err.message });
      process.exit(1);
    }
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force-exit if requests do not drain within 10 seconds
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
