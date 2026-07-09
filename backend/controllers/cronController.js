import User from '../models/User.js';
import CourseProgress from '../models/CourseProgress.js';
import LiveClass from '../models/LiveClass.js';
import { sendMail } from '../config/mailer.js';
import { subscriptionRenewalReminderEmail, weeklyParentReportEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createNotification } from './notificationController.js';
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

      // Guarded by the same renewalReminderSentFor idempotency check above,
      // so this fires exactly once per billing period, alongside the email.
      await createNotification({
        recipient: u._id,
        type:      'subscription_expiring',
        title:     'Your subscription is renewing soon',
        body:      autoRenew
          ? `Your ${plan} plan will auto-renew in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
          : `Your ${plan} plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew to keep your access.`,
        link:      '/billing',
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

  // The only server-side signal that this job actually ran and what it did —
  // it's invoked by a scheduler external to this repo (see render.yaml), so
  // without this line there is no record in the logs of whether/when it fired.
  logger.info('Cron: renewal-reminders completed', { withinDays: REMIND_WITHIN_DAYS, candidates: users.length, sent, skipped });
  res.json({ ok: true, withinDays: REMIND_WITHIN_DAYS, candidates: users.length, sent, skipped });
});

// @desc   Send weekly progress email to parents summarising each child's activity.
// @route  GET /api/cron/weekly-parent-reports
// @access Cron secret
// Builds one child's report data from already-batch-fetched lookup maps
// (see sendWeeklyParentReports below) instead of querying per child.
// lessonsThisWeek's calculation is unchanged from the original per-child
// implementation — it is not "lessons completed in the last 7 days" (despite
// the name); it counts every completed lesson in a course whose lastActivity
// falls in the last 7 days. Preserved as-is: that's a report-accuracy
// question, not part of the N+1 query-performance fix this function makes.
export function buildChildReportData(childId, { childById, progressByChild, nextClassByChild, oneWeekAgo }) {
  const child = childById.get(String(childId));
  if (!child) return null;

  const progress = progressByChild.get(String(childId)) || [];
  const lessonsThisWeek = progress.reduce((n, p) => {
    return n + (p.completed?.filter ? p.completed.filter((_, idx) =>
      p.lastActivity && new Date(p.lastActivity) > oneWeekAgo ? true : false
    ).length : 0);
  }, 0);

  const nextClass = nextClassByChild.get(String(childId));

  return {
    childName: child.name,
    streak: child.streak || 0,
    lessonsThisWeek,
    xp: child.xp || 0,
    level: child.level || 1,
    nextClass: nextClass?.startsAt || null,
  };
}

export const sendWeeklyParentReports = asyncHandler(async (_req, res) => {
  const parents = await User.find({ role: 'parent', children: { $not: { $size: 0 } } })
    .select('name email children')
    .lean();

  const oneWeekAgo = new Date(Date.now() - 7 * DAY);
  const now = new Date();

  // Batch-fetch every child's profile, course progress, and next scheduled
  // class in three queries total — not three PER child. The previous
  // implementation ran one User.findById + one CourseProgress.find + one
  // LiveClass.findOne per child (an N+1 pattern), which the discovery-audit
  // report flagged as the most timeout-prone job in the codebase: query
  // count scaled linearly with total children across all parents. Grouping
  // is done in-memory below.
  const allChildIds = [...new Set(parents.flatMap((p) => p.children.map(String)))];

  const [children, allProgress, upcomingClasses] = await Promise.all([
    User.find({ _id: { $in: allChildIds } }).select('name xp level streak').lean(),
    CourseProgress.find({ user: { $in: allChildIds } }).select('user completed lastActivity').lean(),
    LiveClass.find({ student: { $in: allChildIds }, startsAt: { $gte: now } })
      .select('student startsAt').sort({ startsAt: 1 }).lean(),
  ]);

  const childById = new Map(children.map((c) => [String(c._id), c]));

  const progressByChild = new Map();
  for (const p of allProgress) {
    const key = String(p.user);
    if (!progressByChild.has(key)) progressByChild.set(key, []);
    progressByChild.get(key).push(p);
  }

  // upcomingClasses is sorted by startsAt ascending, so the first entry seen
  // per student is their earliest upcoming class — the same result
  // findOne(...).sort({startsAt:1}) gave per child before.
  const nextClassByChild = new Map();
  for (const c of upcomingClasses) {
    const key = String(c.student);
    if (!nextClassByChild.has(key)) nextClassByChild.set(key, c);
  }

  const lookups = { childById, progressByChild, nextClassByChild, oneWeekAgo };
  let sent = 0;

  for (let i = 0; i < parents.length; i += BATCH_SIZE) {
    const batch = parents.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(async (parent) => {
      try {
        const validChildren = parent.children
          .map((childId) => buildChildReportData(childId, lookups))
          .filter(Boolean);
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

  logger.info('Cron: weekly-parent-reports completed', { parents: parents.length, sent });
  res.json({ ok: true, parents: parents.length, sent });
});
