import https from 'https';
import logger from './logger.js';

/*
 * Self-ping to prevent Render free-tier sleep (15-min inactivity timeout).
 *
 * Render injects RENDER_EXTERNAL_URL automatically for every web service,
 * e.g. "https://alrahma-1.onrender.com". We ping /health every 14 minutes
 * so the instance never crosses the 15-min idle threshold.
 *
 * Limitation: this cannot WAKE the server after it has already slept.
 * For true zero-cold-start, pair with a free external monitor:
 *   → https://uptimerobot.com  (ping every 5 min, free plan)
 *   Set the monitor URL to: https://alrahma-1.onrender.com/health
 */
export function startKeepAlive() {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base) return; // local dev — do nothing

  const url = `${base}/health`;
  const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

  const ping = () =>
    https
      .get(url, (res) => {
        logger.debug('Keep-alive ping succeeded', { status: res.statusCode });
        res.resume(); // drain the response so the socket closes cleanly
      })
      .on('error', (err) => {
        logger.warn('Keep-alive ping failed', { url, message: err.message });
      });

  setInterval(ping, INTERVAL_MS);
  logger.info('Keep-alive active', { url, intervalMs: INTERVAL_MS });
}
