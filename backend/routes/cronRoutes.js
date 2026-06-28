import { Router } from 'express';
import crypto from 'crypto';
import { sendRenewalReminders } from '../controllers/cronController.js';

// Constant-time string comparison — avoids leaking the secret through response
// timing. Returns false on length mismatch without timing-comparing.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Guards the cron endpoints with a shared secret. Vercel Cron automatically
// sends "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET env var is
// set; we also accept an x-cron-secret header for manual runs / curl.
// Note: ?key= query-param was removed — query strings appear in server logs.
function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET not configured' });

  const auth = req.headers.authorization || '';
  const provided = auth.startsWith('Bearer ')
    ? auth.slice(7)
    : req.headers['x-cron-secret'];

  if (!provided || !safeEqual(provided, secret)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

const router = Router();

router.get('/renewal-reminders', cronAuth, sendRenewalReminders);

export default router;
