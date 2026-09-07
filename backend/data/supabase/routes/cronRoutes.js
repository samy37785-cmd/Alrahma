// Mirrors backend/routes/cronRoutes.js exactly (same cronAuth guard, same
// route shapes) — only the controller implementation differs.
import { Router } from 'express';
import crypto from 'crypto';
import { sendRenewalReminders, sendWeeklyParentReports } from '../cronController.js';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET not configured' });

  const auth = req.headers.authorization || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-cron-secret'];

  if (!provided || !safeEqual(provided, secret)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

const router = Router();

router.get('/renewal-reminders', cronAuth, sendRenewalReminders);
router.get('/weekly-parent-reports', cronAuth, sendWeeklyParentReports);

export default router;
