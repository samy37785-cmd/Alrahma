// DATA_BACKEND=supabase controller for /api/cron — mounted unconditionally
// in app.js with no isSupabaseBackend() branch at all, and
// controllers/cronController.js imports Mongoose models directly: a second
// route-parity gap found by the same app.js route-mount audit that found
// /api/search (Stage 2F's "28 domains" list covered neither). Runs under
// withServiceRole — a scheduled job with no acting end user to impersonate,
// same reasoning as the webhook handlers in stripeController.js/
// paypalController.js. `subscriptions`/`profiles`/`course_progress`/
// `live_classes` all predate the blanket "grant select, insert, update,
// delete on all tables in schema public to service_role" in
// 0004_privilege_reconciliation.sql, so no new grants were needed — only
// the renewal-reminder dedup column (0020_renewal_reminder_tracking.sql).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendMail } from '../../config/mailer.js';
import { subscriptionRenewalReminderEmail, weeklyParentReportEmail } from '../../config/emailTemplates.js';
import { withServiceRole } from './client.js';
import logger from '../../config/logger.js';

const REMIND_WITHIN_DAYS = Number(process.env.RENEWAL_REMINDER_DAYS) || 3;
const DAY = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 10;

// @route GET /api/cron/renewal-reminders
export const sendRenewalReminders = asyncHandler(async (_req, res) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMIND_WITHIN_DAYS * DAY);

  const candidates = await withServiceRole(async (client) => {
    const r = await client.query(
      `SELECT s.id, s.provider, s.cancel_at_period_end, s.current_period_end, s.renewal_reminder_sent_for,
              p.name, p.email, pl.name AS plan_name
         FROM subscriptions s
         JOIN profiles p ON p.id = s.user_id
         LEFT JOIN plans pl ON pl.id = s.plan_id
        WHERE s.status = 'active' AND s.current_period_end >= $1 AND s.current_period_end <= $2`,
      [now, cutoff]
    );
    return r.rows;
  });

  let sent = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (sub) => {
      if (sub.renewal_reminder_sent_for &&
          new Date(sub.renewal_reminder_sent_for).getTime() === new Date(sub.current_period_end).getTime()) {
        skipped++;
        return;
      }

      const daysLeft = Math.max(0, Math.ceil((new Date(sub.current_period_end) - now) / DAY));
      const autoRenew = sub.provider === 'stripe' && !sub.cancel_at_period_end;

      await sendMail({
        to: sub.email,
        subject: 'Your Al-Rahma Academy subscription is renewing soon',
        html: subscriptionRenewalReminderEmail({
          name: sub.name, plan: sub.plan_name, validUntil: sub.current_period_end, daysLeft, autoRenew,
        }),
      });

      await withServiceRole((client) => client.query(
        'UPDATE subscriptions SET renewal_reminder_sent_for = $2 WHERE id = $1',
        [sub.id, sub.current_period_end]
      ));
      sent++;
    }));

    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        logger.error('Renewal reminder failed for subscription', { subscriptionId: batch[idx].id, message: r.reason?.message });
      }
    });
  }

  logger.info('Cron: renewal-reminders completed', { withinDays: REMIND_WITHIN_DAYS, candidates: candidates.length, sent, skipped });
  res.json({ ok: true, withinDays: REMIND_WITHIN_DAYS, candidates: candidates.length, sent, skipped });
});

// @route GET /api/cron/weekly-parent-reports
export const sendWeeklyParentReports = asyncHandler(async (_req, res) => {
  const oneWeekAgo = new Date(Date.now() - 7 * DAY);
  const now = new Date();

  const { parents, children, progressByChild, nextClassByChild } = await withServiceRole(async (client) => {
    // Sequential, not Promise.all — a single pg client can only run one
    // query at a time; firing several concurrently on it is deprecated,
    // undefined behavior, not real parallelism (same bug class fixed
    // elsewhere in backend/data/supabase during Part A).
    const parentsRes = await client.query(
      `SELECT DISTINCT p.id, p.name, p.email
         FROM parent_student_links psl
         JOIN profiles p ON p.id = psl.parent_id`
    );
    const parentRows = parentsRes.rows;
    if (parentRows.length === 0) return { parents: [], children: [], progressByChild: new Map(), nextClassByChild: new Map() };

    const linksRes = await client.query(
      `SELECT parent_id, student_id FROM parent_student_links WHERE parent_id = ANY($1)`,
      [parentRows.map((p) => p.id)]
    );
    const childIdsByParent = new Map();
    for (const row of linksRes.rows) {
      if (!childIdsByParent.has(row.parent_id)) childIdsByParent.set(row.parent_id, []);
      childIdsByParent.get(row.parent_id).push(row.student_id);
    }
    const allChildIds = [...new Set(linksRes.rows.map((r) => r.student_id))];

    const childrenRes = await client.query(
      `SELECT id, name, xp, level, streak FROM profiles WHERE id = ANY($1)`,
      [allChildIds]
    );
    const progressRes = await client.query(
      `SELECT user_id, completed, last_activity FROM course_progress WHERE user_id = ANY($1)`,
      [allChildIds]
    );
    const classesRes = await client.query(
      `SELECT student_id, starts_at FROM live_classes WHERE student_id = ANY($1) AND starts_at >= $2 ORDER BY starts_at ASC`,
      [allChildIds, now]
    );

    const progByChild = new Map();
    for (const row of progressRes.rows) {
      if (!progByChild.has(row.user_id)) progByChild.set(row.user_id, []);
      progByChild.get(row.user_id).push(row);
    }
    const nextClassByChild = new Map();
    for (const row of classesRes.rows) {
      if (!nextClassByChild.has(row.student_id)) nextClassByChild.set(row.student_id, row);
    }

    return {
      parents: parentRows.map((p) => ({ ...p, children: childIdsByParent.get(p.id) || [] })),
      children: childrenRes.rows,
      progressByChild: progByChild,
      nextClassByChild,
    };
  });

  const childById = new Map(children.map((c) => [c.id, c]));

  function buildChildReportData(childId) {
    const child = childById.get(childId);
    if (!child) return null;
    const progress = progressByChild.get(childId) || [];
    const lessonsThisWeek = progress.reduce((n, p) => {
      return n + ((p.completed || []).filter(() => p.last_activity && new Date(p.last_activity) > oneWeekAgo).length);
    }, 0);
    const nextClass = nextClassByChild.get(childId);
    return {
      childName: child.name,
      streak: child.streak || 0,
      lessonsThisWeek,
      xp: child.xp || 0,
      level: child.level || 1,
      nextClass: nextClass?.starts_at || null,
    };
  }

  let sent = 0;
  for (let i = 0; i < parents.length; i += BATCH_SIZE) {
    const batch = parents.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(async (parent) => {
      try {
        const validChildren = parent.children.map(buildChildReportData).filter(Boolean);
        if (!validChildren.length) return;
        await sendMail({
          to: parent.email,
          subject: 'Weekly Progress Report — Al-Rahma Academy',
          html: weeklyParentReportEmail({ parentName: parent.name, children: validChildren }),
        });
        sent++;
      } catch (err) {
        logger.error('Weekly parent report failed', { parentId: parent.id, message: err.message });
      }
    }));
  }

  logger.info('Cron: weekly-parent-reports completed', { parents: parents.length, sent });
  res.json({ ok: true, parents: parents.length, sent });
});
