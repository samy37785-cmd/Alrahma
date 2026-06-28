import User from '../models/User.js';
import CourseProgress from '../models/CourseProgress.js';
import LiveClass from '../models/LiveClass.js';
import { sendMail } from '../config/mailer.js';
import { subscriptionRenewalReminderEmail, weeklyParentReportEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import logger from '../config/logger.js';

// How many days before expiry we send the heads-up. Override with RENEWAL_REMINDER_DAYS.
const REMIND_WITHIN_DAYS = Number(process.env.RENEWAL_REMINDER_DAYS) || 3;
const DAY = 24 * 60 * 60 * 1000;

// Maximum number of emails to send concurrently.
// Keeps SMTP load predictable without serialising all sends.
const BATCH_SIZE = 10;

// @desc   Email active subscribers whose plan expires within the next few days.
//         Idempotent per billing period: subscription.renewalReminderSentFor
//         records the period we last emailed, so re-running the job (or running
//         it daily) never double-sends for the same validUntil.
// @route  GET /api/cron/renewal-reminders
// @access Cron secret (see cronAuth in routes/cronRoutes.js)
export const sendRenewalReminders = asyncHandler(async (_req, res) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMIND_WITHIN_DAYS * DAY);

  const users = await User.find({
    'subscription.status': 'active',
    'subscription.validUntil': { $gte: now, $lte: cutoff },
  }).select('name email subscription').lean();

  let sent = 0;
  let skipped = 0;

  // Process in parallel batches to avoid timing out on large user lists
  // while keeping SMTP load manageable.
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(batch.map(async (u) => {
      const { validUntil, plan, provider, cancelAtPeriodEnd, renewalReminderSentFor } = u.subscription;

      // Already reminded for this exact period end? Skip.
      if (renewalReminderSentFor &&
          new Date(renewalReminderSentFor).getTime() === new Date(validUntil).getTime()) {
        skipped++;
        return;
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
    }));

    // Log any individual failures without aborting the whole batch.
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        logger.error('Renewal reminder failed for user', {
          userId: batch[idx]._id,
          message: r.reason?.message,
        });
      }
    });
  }

  res.json({ ok: true, withinDays: REMIND_WITHIN_DAYS, candidates: users.length, sent, skipped });
});

// @desc   Send weekly progress email to parents summarising each child's activity.
// @route  GET /api/cron/weekly-parent-reports
// @access Cron secret
export const sendWeeklyParentReports = asyncHandler(async (_req, res) => {
  const parents = await User.find({ role: 'parent', children: { $not: { $size: 0 } } })
    .select('name email children')
    .lean();

  const oneWeekAgo = new Date(Date.now() - 7 * DAY);
  let sent = 0;

  for (let i = 0; i < parents.length; i += BATCH_SIZE) {
    const batch = parents.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(async (parent) => {
      try {
        const childrenData = await Promise.all(parent.children.map(async (childId) => {
          const child = await User.findById(childId).select('name xp level streak').lean();
          if (!child) return null;

          // Lessons completed in the last 7 days
          const progress = await CourseProgress.find({ user: childId }).select('completed lastActivity').lean();
          const lessonsThisWeek = progress.reduce((n, p) => {
            return n + (p.completed?.filter ? p.completed.filter((_, idx) =>
              p.lastActivity && new Date(p.lastActivity) > oneWeekAgo ? true : false
            ).length : 0);
          }, 0);

          // Next scheduled class
          const nextClass = await LiveClass.findOne({
            student: childId, startsAt: { $gte: new Date() },
          }).select('startsAt').sort({ startsAt: 1 }).lean();

          return {
            childName: child.name,
            streak: child.streak || 0,
            lessonsThisWeek,
            xp: child.xp || 0,
            level: child.level || 1,
            nextClass: nextClass?.startsAt || null,
          };
        }));

        const validChildren = childrenData.filter(Boolean);
        if (!validChildren.length) return;

        await sendMail({
          to: parent.email,
          subject: 'Weekly Progress Report — Al-Rahma Academy',
          html: weeklyParentReportEmail({ parentName: parent.name, children: validChildren }),
        });
        sent++;
      } catch (err) {
        logger.error('Weekly parent report failed', { parentId: parent._id, message: err.message });
      }
    }));
  }

  res.json({ ok: true, parents: parents.length, sent });
});
