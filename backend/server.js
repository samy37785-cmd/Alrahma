// Production entry point — Render runs "node server.js" directly (see
// package.json's "main"/"start" and render.yaml's startCommand). Also used
// for local development (no separate dev-only entry point exists).
import app from './app.js';
import connectDB from './config/db.js';
import { startKeepAlive } from './config/keepAlive.js';
import logger from './config/logger.js';
import { isSupabaseBackend } from './config/dataBackend.js';

// Connect eagerly at startup so the first request isn't slow. Under
// DATA_BACKEND=supabase there is no MongoDB connection to establish — every
// route opens its own Postgres connection instead (see app.js's own
// isSupabaseBackend()-gated DB-connection-check middleware and /ready
// handler for the same pattern) — so skip this entirely rather than fail
// process startup over an unreachable/unset MONGO_URI that mode never uses.
if (!isSupabaseBackend()) {
  connectDB().catch((err) => {
    logger.error('MongoDB connection failed at startup', { message: err.message });
    process.exit(1);
  });
}

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
