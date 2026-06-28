import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { subscriptionRenewalReminderEmail } from '../config/emailTemplates.js';

// How many days before expiry we send the heads-up. Override with RENEWAL_REMINDER_DAYS.
const REMIND_WITHIN_DAYS = Number(process.env.RENEWAL_REMINDER_DAYS) || 3;
const DAY = 24 * 60 * 60 * 1000;

// @desc   Email active subscribers whose plan expires within the next few days.
//         Idempotent per billing period: subscription.renewalReminderSentFor
//         records the period we last emailed, so re-running the job (or running
//         it daily) never double-sends for the same validUntil.
// @route  GET /api/cron/renewal-reminders
// @access Cron secret (see cronAuth in routes/cronRoutes.js)
export async function sendRenewalReminders(_req, res, next) {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() + REMIND_WITHIN_DAYS * DAY);

    const users = await User.find({
      'subscription.status': 'active',
      'subscription.validUntil': { $gte: now, $lte: cutoff },
    }).select('name email subscription');

    let sent = 0;
    for (const u of users) {
      const { validUntil, plan, provider, cancelAtPeriodEnd, renewalReminderSentFor } = u.subscription;

      // Already reminded for this exact period end? Skip.
      if (renewalReminderSentFor &&
          new Date(renewalReminderSentFor).getTime() === new Date(validUntil).getTime()) {
        continue;
      }

      const daysLeft = Math.max(0, Math.ceil((new Date(validUntil) - now) / DAY));
      // Stripe re-charges the saved card automatically unless the user cancelled.
      const autoRenew = provider === 'stripe' && !cancelAtPeriodEnd;

      await sendMail({
        to: u.email,
        subject: 'Your Al-Rahma Academy subscription is renewing soon',
        html: subscriptionRenewalReminderEmail({ name: u.name, plan, validUntil, daysLeft, autoRenew }),
      });

      // Mark this period as reminded so we don't email it again.
      await User.updateOne(
        { _id: u._id },
        { 'subscription.renewalReminderSentFor': validUntil }
      );
      sent++;
    }

    res.json({ ok: true, withinDays: REMIND_WITHIN_DAYS, candidates: users.length, sent });
  } catch (err) {
    next(err);
  }
}
