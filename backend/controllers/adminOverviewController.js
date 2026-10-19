import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import ManualPayment from '../models/ManualPayment.js';
import Subscriber from '../models/Subscriber.js';
import TrialRequest from '../models/TrialRequest.js';
import User from '../models/User.js';
import logger from '../config/logger.js';
import { ENROLLMENT_STATUSES } from '../utils/enrollmentValidation.js';

// The admin console's Overview tab. Every figure is counted here, in MongoDB,
// over all records, instead of in the browser from the first page of each
// admin list (users and bookings load 50 at a time).
//
// Each section is computed only when the signed-in admin holds that
// section's read permission, the same one its own tab needs. A section the
// admin may not see, or that fails to load, comes back as
// { status: 'forbidden' } or { status: 'error' } with no numbers, so the page
// can say "not available" instead of showing a 0.

const TRIAL_STATUSES = TrialRequest.schema.path('status').enumValues;
const MANUAL_PAYMENT_STATUSES = ManualPayment.schema.path('status').enumValues;

// A booking counts as paid only when an admin recorded all of it: a paid
// status, the agreed amount, its currency and the payment date. A booking
// with a price but no recorded payment is not money received.
const PAID_BOOKING_STATUSES = ['paid', 'enrolled'];
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;
const RECORDED_PAYMENT = {
  status: { $in: PAID_BOOKING_STATUSES },
  agreedAmount: { $type: 'number', $gte: 0 },
  currency: { $regex: CURRENCY_PATTERN },
  paidAt: { $type: 'date' },
};

const USER_MONTHS = 7;
const BOOKING_MONTHS = 6;

// The admin's own time zone, so "this month" matches their calendar. Only
// a name the runtime knows is accepted; anything else falls back to UTC.
export function resolveTimeZone(raw) {
  if (typeof raw !== 'string' || raw.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(raw)) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// ['2026-04', ..., '2026-10']: the last `count` calendar months in `timeZone`,
// oldest first, ending with the current one.
export function lastMonths(now, count, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

// Counts documents per calendar month of `field` (in `timeZone`) for the
// given months. The query window starts two days before the first month in
// UTC, which covers every time zone; the month keys then do the exact cut.
async function countByMonth(Model, field, months, timeZone, extraMatch = {}) {
  const [y, m] = months[0].split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 2 * 24 * 60 * 60 * 1000);
  const rows = await Model.aggregate([
    { $match: { ...extraMatch, [field]: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: `$${field}`, timezone: timeZone } }, count: { $sum: 1 } } },
  ]);
  const byKey = new Map(rows.map((r) => [r._id, r.count]));
  return months.map((month) => ({ month, count: byKey.get(month) ?? 0 }));
}

// { pending: 3, contacted: 1, ... } for every value in `statuses`, plus
// `other` for any stored value outside them.
async function countByStatus(Model, statuses, match = {}) {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const out = Object.fromEntries(statuses.map((s) => [s, 0]));
  out.other = 0;
  for (const r of rows) {
    if (statuses.includes(r._id)) out[r._id] = r.count;
    else out.other += r.count;
  }
  return out;
}

// Amounts per currency, never added across currencies. Rounded to cents to
// hide floating-point noise from summing decimals.
async function sumByCurrency(match) {
  const rows = await Enrollment.aggregate([
    { $match: match },
    { $group: { _id: { $toUpper: '$currency' }, count: { $sum: 1 }, amount: { $sum: '$agreedAmount' } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ currency: r._id, count: r.count, amount: Math.round(r.amount * 100) / 100 }));
}

async function usersSection(now, timeZone) {
  const [total, newByMonth] = await Promise.all([
    User.countDocuments({}),
    countByMonth(User, 'createdAt', lastMonths(now, USER_MONTHS, timeZone), timeZone),
  ]);
  return { total, newByMonth };
}

// The same rule as User.hasActiveSubscription(): status 'active' AND a
// validUntil still in the future. Nothing flips the status on expiry, so
// accounts still marked active after their end date are counted apart.
async function subscriptionsSection(now) {
  const [active, markedActiveButExpired] = await Promise.all([
    User.countDocuments({ 'subscription.status': 'active', 'subscription.validUntil': { $gt: now } }),
    User.countDocuments({
      'subscription.status': 'active',
      $or: [{ 'subscription.validUntil': { $lte: now } }, { 'subscription.validUntil': null }],
    }),
  ]);
  return { active, markedActiveButExpired };
}

async function bookingsSection(now, timeZone) {
  const [total, byStatus, newByMonth] = await Promise.all([
    Enrollment.countDocuments({}),
    countByStatus(Enrollment, ENROLLMENT_STATUSES),
    countByMonth(Enrollment, 'createdAt', lastMonths(now, BOOKING_MONTHS, timeZone), timeZone),
  ]);
  return { total, byStatus, newByMonth };
}

async function bookingPaymentsSection(now, timeZone) {
  const [paidByCurrency, markedPaid, recorded, awaitingCount, awaitingByCurrency, paidByMonth] = await Promise.all([
    sumByCurrency(RECORDED_PAYMENT),
    Enrollment.countDocuments({ status: { $in: PAID_BOOKING_STATUSES } }),
    Enrollment.countDocuments(RECORDED_PAYMENT),
    Enrollment.countDocuments({ status: 'awaiting_payment' }),
    sumByCurrency({ status: 'awaiting_payment', agreedAmount: { $type: 'number', $gte: 0 }, currency: { $regex: CURRENCY_PATTERN } }),
    countByMonth(Enrollment, 'paidAt', lastMonths(now, BOOKING_MONTHS, timeZone), timeZone, RECORDED_PAYMENT),
  ]);
  return {
    paidByCurrency,
    // Marked paid/enrolled but missing the amount, currency or payment date,
    // so not in paidByCurrency.
    paidMissingDetails: markedPaid - recorded,
    awaitingPayment: { count: awaitingCount, agreedByCurrency: awaitingByCurrency },
    paidByMonth,
  };
}

async function trialsSection() {
  const [total, byStatus] = await Promise.all([
    TrialRequest.countDocuments({}),
    countByStatus(TrialRequest, TRIAL_STATUSES),
  ]);
  return { total, byStatus };
}

async function newsletterSection() {
  return { total: await Subscriber.countDocuments({}) };
}

// The old manual-payment form, closed since the booking-first model (its
// POST answers 410). Kept apart from booking payments: it is history, not
// current revenue.
async function legacyManualPaymentsSection() {
  const [total, byStatus] = await Promise.all([
    ManualPayment.countDocuments({}),
    countByStatus(ManualPayment, MANUAL_PAYMENT_STATUSES),
  ]);
  return { total, byStatus };
}

// Every course, published or not, with its real module and lesson counts.
// Courses stored before `modules` existed have no such field and count 0.
async function coursesSection() {
  const items = await Course.aggregate([
    { $sort: { createdAt: -1 } },
    { $project: {
      title: 1, icon: 1, level: 1,
      published: { $ne: ['$published', false] },
      modules: { $size: { $ifNull: ['$modules', []] } },
      lessons: { $sum: { $map: { input: { $ifNull: ['$modules', []] }, as: 'm', in: { $size: { $ifNull: ['$$m.lessons', []] } } } } },
      resources: { $size: { $ifNull: ['$resources', []] } },
    } },
  ]);
  return { total: items.length, published: items.filter((c) => c.published).length, items };
}

const ACTIVITY_LIMIT = 10;

// The newest events from the sources this admin may read, newest first.
// Each source gives its own newest ACTIVITY_LIMIT, so the merged list's top
// ACTIVITY_LIMIT is the true newest across those sources even when every one
// of them comes from a single source.
// `omitted` names the sources left out (no permission, or failed to load).
async function activitySection(can) {
  const sources = [
    { type: 'account', allowed: can('users:read'), load: () => User.find({}, 'name email createdAt').sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).lean() },
    { type: 'booking', allowed: can('enrollments:read'), load: () => Enrollment.find({}, 'name email status plan bookingRef createdAt').sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).lean() },
    { type: 'trial', allowed: can('enrollments:read'), load: () => TrialRequest.find({}, 'name email course status createdAt').sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).lean() },
    { type: 'newsletter', allowed: can('users:read'), load: () => Subscriber.find({}, 'email createdAt').sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).lean() },
  ];
  const omitted = [];
  const events = [];
  await Promise.all(sources.map(async ({ type, allowed, load }) => {
    if (!allowed) { omitted.push(type); return; }
    try {
      for (const doc of await load()) events.push({ type, ...doc, _id: String(doc._id) });
    } catch (err) {
      logger.error('admin overview: activity source failed', { source: type, message: err.message });
      omitted.push(type);
    }
  }));
  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { events: events.slice(0, ACTIVITY_LIMIT), omitted: omitted.sort() };
}

async function section(name, allowed, compute) {
  if (!allowed) return { status: 'forbidden' };
  try {
    return { status: 'ok', ...(await compute()) };
  } catch (err) {
    logger.error('admin overview: section failed', { section: name, message: err.message });
    return { status: 'error' };
  }
}

// @desc   Figures for the admin console's Overview tab
// @route  GET /api/v1/admin/stats/overview?tz=Africa/Cairo
// @access Admin (MFA). Each section needs that section's read permission.
export async function getOverviewStats(req, res) {
  const can = (...perms) => req.adminUser.hasPermission(...perms);
  const now = new Date();
  const timeZone = resolveTimeZone(req.query.tz);

  const entries = await Promise.all([
    ['users', section('users', can('users:read'), () => usersSection(now, timeZone))],
    ['subscriptions', section('subscriptions', can('users:read'), () => subscriptionsSection(now))],
    ['bookings', section('bookings', can('enrollments:read'), () => bookingsSection(now, timeZone))],
    ['bookingPayments', section('bookingPayments', can('enrollments:read', 'payments:read'), () => bookingPaymentsSection(now, timeZone))],
    ['trials', section('trials', can('enrollments:read'), trialsSection)],
    ['newsletter', section('newsletter', can('users:read'), newsletterSection)],
    ['legacyManualPayments', section('legacyManualPayments', can('payments:read'), legacyManualPaymentsSection)],
    ['courses', section('courses', can('courses:read'), coursesSection)],
    ['activity', section('activity', true, () => activitySection(can))],
  ].map(async ([key, promise]) => [key, await promise]));

  res.set('Cache-Control', 'no-store');
  res.json({ generatedAt: now.toISOString(), timeZone, sections: Object.fromEntries(entries) });
}
