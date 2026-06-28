import { Router } from 'express';
import { sendRenewalReminders } from '../controllers/cronController.js';

// Guards the cron endpoints with a shared secret. Vercel Cron automatically
// sends "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET env var is
// set; we also accept an x-cron-secret header or ?key= for manual runs / curl.
function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET not configured' });

  const auth = req.headers.authorization || '';
  const provided = auth.startsWith('Bearer ')
    ? auth.slice(7)
    : (req.headers['x-cron-secret'] || req.query.key);

  if (provided !== secret) return res.status(401).json({ message: 'Unauthorized' });
  next();
}

const router = Router();

router.get('/renewal-reminders', cronAuth, sendRenewalReminders);

export default router;
