import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// GET /api/v1/admin/stats/overview: the admin console's Overview figures,
// counted in MongoDB over every record. The admin lists the page used to
// count from load 50 users and 50 bookings, so each collection here holds
// more than 50 records.
//
// middleware/ipWhitelist.js reads ADMIN_IP_WHITELIST once at import, so it
// is set before app.js loads, and every request comes from the allowed
// address unless a test says otherwise (app.js trusts one proxy hop).

const ALLOWED_IP = '198.51.100.7';
const OTHER_IP = '203.0.113.9';
const PATH = '/api/v1/admin/stats/overview';
const DAY = 24 * 60 * 60 * 1000;

let app;
let models;
let signAccessToken;
let resetServiceStatusCache;

before(async () => {
  process.env.ADMIN_IP_WHITELIST = ALLOWED_IP;
  ({ default: app } = await import('../app.js'));
  const load = async (name) => (await import(`../models/${name}.js`)).default;
  models = {
    AdminUser: await load('AdminUser'), User: await load('User'), Enrollment: await load('Enrollment'),
    TrialRequest: await load('TrialRequest'), Subscriber: await load('Subscriber'),
    ManualPayment: await load('ManualPayment'), Course: await load('Course'),
  };
  ({ signAccessToken } = await import('../utils/adminAuthTokens.js'));
  ({ resetServiceStatusCache } = await import('../controllers/serviceStatusController.js'));
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminCookie(role = 'admin', { mfaVerified = true } = {}) {
  const admin = await models.AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role, mfaEnabled: true,
  });
  return `admin_at=${signAccessToken(admin._id, admin.role, mfaVerified)}`;
}

function getStats(cookie, { query = 'tz=UTC', ip = ALLOWED_IP } = {}) {
  const req = request(app).get(query ? `${PATH}?${query}` : PATH).set('X-Forwarded-For', ip);
  return cookie ? req.set('Cookie', cookie) : req;
}

const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
let seq = 0;
const email = (prefix) => `${prefix}-${seq++}@example.com`;

// 60 accounts: 20 with paid access now, 10 marked active but past (or
// without) an end date, 30 inactive. Some carry old roles: they still count.
async function seedUsers(now) {
  const base = (subscription, i) => ({
    name: `User ${i}`, email: email('user'), password: 'x'.repeat(60), role: ['student', 'teacher', 'parent'][i % 3],
    subscription, createdAt: new Date(now - (i % 4) * 40 * DAY), updatedAt: now,
  });
  await models.User.collection.insertMany([
    ...times(20, (i) => base({ status: 'active', plan: 'Standard', validUntil: new Date(now.getTime() + 10 * DAY) }, i)),
    ...times(7, (i) => base({ status: 'active', plan: 'Standard', validUntil: new Date(now.getTime() - DAY) }, i)),
    ...times(3, (i) => base({ status: 'active', plan: 'Standard', validUntil: null }, i)),
    ...times(30, (i) => base({ status: 'inactive', plan: null, validUntil: null }, i)),
  ]);
}

// 55 bookings. Recorded payments (paid/enrolled + amount + currency + date):
// EUR 6 (5 x 100.10 + 1 x 300), USD 2 x 80, EGP 2 x 1500. Not counted:
// a paid booking with no payment date, an enrolled one with no currency,
// cancelled ones that still carry a date and amount, and every booking that
// only has an agreed price.
async function seedBookings(now) {
  const paidAt = new Date(now.getTime() - 3 * DAY);
  const b = (status, extra = {}) => ({
    name: 'Booker', email: email('booking'), status, createdAt: now, updatedAt: now, ...extra,
  });
  await models.Enrollment.collection.insertMany([
    ...times(20, () => b('pending')),
    ...times(5, () => b('contacted', { agreedAmount: 90, currency: 'EUR' })),
    ...times(4, () => b('awaiting_payment', { agreedAmount: 50, currency: 'EUR' })),
    ...times(2, () => b('awaiting_payment')),
    ...times(5, () => b('paid', { agreedAmount: 100.1, currency: 'EUR', paidAt })),
    ...times(2, () => b('paid', { agreedAmount: 80, currency: 'USD', paidAt })),
    b('paid', { agreedAmount: 70, currency: 'EUR' }),
    ...times(2, () => b('enrolled', { agreedAmount: 1500, currency: 'EGP', paidAt })),
    b('enrolled', { agreedAmount: 300, currency: 'eur', paidAt }),
    b('enrolled', { agreedAmount: 60, paidAt }),
    ...times(10, () => b('cancelled')),
    ...times(2, () => b('cancelled', { agreedAmount: 999, currency: 'EUR', paidAt })),
  ]);
}

async function seedRest(now) {
  const t = (status) => ({ name: 'Lead', email: email('trial'), status, createdAt: now, updatedAt: now });
  await models.TrialRequest.collection.insertMany([
    ...times(30, () => t('new')), ...times(12, () => t('contacted')), ...times(10, () => t('scheduled')),
  ]);
  await models.Subscriber.collection.insertMany(times(51, () => ({ email: email('news'), createdAt: now, updatedAt: now })));
  const mp = (status) => ({ plan: 'Starter', amount: 10, currency: 'EUR', method: 'bank', status, createdAt: now, updatedAt: now });
  await models.ManualPayment.collection.insertMany([mp('pending'), mp('approved'), mp('rejected')]);
  await models.Course.create({
    title: 'Tajweed', description: 'd', resources: [{ type: 'pdf', label: 'Book', url: 'https://example.com/b.pdf' }],
    modules: [
      { title: 'One', lessons: [{ title: 'a' }, { title: 'b' }] },
      { title: 'Two', lessons: [{ title: 'c' }] },
    ],
  });
  await models.Course.create({ title: 'Draft', description: 'd', published: false });
  // The real catalogue's shape: no resources/modules fields at all.
  await models.Course.collection.insertOne({ title: 'Quran reading', description: 'd', published: true, createdAt: now, updatedAt: now });
}

async function seedAll() {
  const now = new Date();
  await seedUsers(now);
  await seedBookings(now);
  await seedRest(now);
}

test('every figure counts all records in MongoDB, not the first page of a list', async () => {
  await seedAll();
  const res = await getStats(await adminCookie());
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  const s = res.body.sections;

  assert.equal(s.users.status, 'ok');
  assert.equal(s.users.total, 60, 'all accounts, whatever role they still carry');
  assert.deepEqual({ ...s.subscriptions }, { status: 'ok', active: 20, markedActiveButExpired: 10 });
  assert.equal(s.bookings.total, 55);
  assert.deepEqual(s.bookings.byStatus, { pending: 20, contacted: 5, awaiting_payment: 6, paid: 8, enrolled: 4, cancelled: 12, other: 0 });
  assert.equal(s.trials.total, 52);
  assert.deepEqual(s.trials.byStatus, { new: 30, contacted: 12, scheduled: 10, other: 0 });
  assert.equal(s.newsletter.total, 51);
  assert.deepEqual({ ...s.legacyManualPayments }, {
    status: 'ok', total: 3, byStatus: { pending: 1, approved: 1, rejected: 1, other: 0 },
  });
  assert.equal(s.courses.total, 3);
  assert.equal(s.courses.published, 2);
  const byTitle = Object.fromEntries(s.courses.items.map((c) => [c.title, c]));
  assert.deepEqual([byTitle.Tajweed.modules, byTitle.Tajweed.lessons, byTitle.Tajweed.resources], [2, 3, 1]);
  assert.deepEqual([byTitle['Quran reading'].modules, byTitle['Quran reading'].lessons], [0, 0]);
  assert.equal(byTitle.Draft.published, false);
});

test('booking payments: only fully recorded paid bookings, one total per currency, never added together', async () => {
  await seedAll();
  const { body } = await getStats(await adminCookie());
  const p = body.sections.bookingPayments;

  assert.equal(p.status, 'ok');
  assert.deepEqual(p.paidByCurrency, [
    { currency: 'EGP', count: 2, amount: 3000 },
    { currency: 'EUR', count: 6, amount: 800.5 },
    { currency: 'USD', count: 2, amount: 160 },
  ]);
  assert.equal(p.paidMissingDetails, 2, 'the paid booking with no date and the enrolled one with no currency');
  assert.deepEqual(p.awaitingPayment, { count: 6, agreedByCurrency: [{ currency: 'EUR', count: 4, amount: 200 }] });
  const thisMonth = p.paidByMonth.at(-1);
  assert.equal(p.paidByMonth.length, 6);
  assert.equal(p.paidByMonth.reduce((n, m) => n + m.count, 0), 10);
  assert.ok(thisMonth.count === 10 || p.paidByMonth.at(-2).count === 10, 'all ten were paid three days ago');
});

// Figures shown together must be read together. This runs every Enrollment
// and TrialRequest read one at a time and, after each, adds a paid booking
// with full details, an awaiting-payment booking with an agreed amount and a
// new trial, so no two reads see the same data. Only figures that come from
// one read still add up.
function changeDataBetweenReads(t) {
  let previous = Promise.resolve();
  const addRecords = async () => {
    const now = new Date();
    await models.Enrollment.collection.insertMany([
      { name: 'Mid', email: email('mid'), status: 'paid', agreedAmount: 10, currency: 'EUR', paidAt: now, createdAt: now, updatedAt: now },
      { name: 'Mid', email: email('mid'), status: 'awaiting_payment', agreedAmount: 20, currency: 'USD', createdAt: now, updatedAt: now },
    ]);
    await models.TrialRequest.collection.insertOne({ name: 'Mid', email: email('mid'), status: 'new', createdAt: now, updatedAt: now });
  };
  for (const [proto, modelOf] of [[mongoose.Query.prototype, (q) => q.model], [mongoose.Aggregate.prototype, (a) => a._model]]) {
    const exec = proto.exec;
    t.mock.method(proto, 'exec', function oneAtATime(...args) {
      if (!['Enrollment', 'TrialRequest'].includes(modelOf(this)?.modelName)) return exec.apply(this, args);
      const run = previous.then(() => exec.apply(this, args)).then(async (result) => { await addRecords(); return result; });
      previous = run.catch(() => {});
      return run;
    });
  }
}

test('figures shown together still add up when bookings and trials change between reads', async (t) => {
  await seedAll();
  const cookie = await adminCookie();
  changeDataBetweenReads(t);
  const { body } = await getStats(cookie);
  const s = body.sections;
  const sum = (byStatus) => Object.values(byStatus).reduce((n, v) => n + v, 0);
  const counted = (rows) => rows.reduce((n, r) => n + r.count, 0);

  assert.ok((await models.Enrollment.collection.countDocuments()) > 55, 'records really were added between reads');
  assert.equal(s.bookings.status, 'ok');
  assert.equal(s.bookings.total, sum(s.bookings.byStatus), 'bookings: the total equals its parts');
  assert.equal(s.trials.total, sum(s.trials.byStatus), 'trials: the total equals its parts');
  const p = s.bookingPayments;
  assert.equal(p.status, 'ok');
  assert.equal(p.paidMissingDetails, 2, 'every added paid booking has its details; only the two seeded ones lack them');
  assert.deepEqual(p.paidByCurrency.filter((r) => r.currency !== 'EUR'),
    [{ currency: 'EGP', count: 2, amount: 3000 }, { currency: 'USD', count: 2, amount: 160 }], 'the added paid bookings are all EUR');
  assert.equal(p.awaitingPayment.count - counted(p.awaitingPayment.agreedByCurrency), 2,
    'awaiting payment: only the two seeded bookings have no agreed amount');
});

test('monthly counts use the admin\'s time zone', async () => {
  const now = new Date();
  // Late on the last day of the previous UTC month: already the next day,
  // and so the current month, in Tokyo (UTC+9, no daylight saving).
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const created = new Date(monthStart - 2 * 60 * 60 * 1000);
  await models.Enrollment.collection.insertOne({ name: 'Edge', email: email('edge'), status: 'pending', createdAt: created, updatedAt: created });
  const key = (tz) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(created);
    return `${parts.find((x) => x.type === 'year').value}-${parts.find((x) => x.type === 'month').value}`;
  };
  assert.notEqual(key('UTC'), key('Asia/Tokyo'));
  const cookie = await adminCookie();

  for (const tz of ['UTC', 'Asia/Tokyo']) {
    const { body } = await getStats(cookie, { query: `tz=${encodeURIComponent(tz)}` });
    assert.equal(body.timeZone, tz);
    const months = body.sections.bookings.newByMonth;
    assert.equal(months.length, 6);
    const hit = months.find((m) => m.month === key(tz));
    assert.ok(hit, `${key(tz)} is in the ${tz} window`);
    assert.equal(hit.count, 1, `counted in ${key(tz)} for ${tz}`);
    assert.equal(months.reduce((n, m) => n + m.count, 0), 1);
  }
});

test('an unknown or malformed time zone falls back to UTC', async () => {
  const cookie = await adminCookie();
  for (const query of ['tz=Not/AZone', 'tz=%24where', 'tz=a&tz=b', 'tz=' + 'A'.repeat(80), '']) {
    const res = await getStats(cookie, { query });
    assert.equal(res.status, 200, query);
    assert.equal(res.body.timeZone, 'UTC', query);
  }
});

test('an editor only gets the sections its permissions cover; the rest carry no numbers', async () => {
  await seedAll();
  const { body } = await getStats(await adminCookie('editor'));
  const s = body.sections;

  for (const key of ['users', 'subscriptions', 'newsletter', 'bookingPayments', 'legacyManualPayments']) {
    assert.deepEqual(s[key], { status: 'forbidden' }, key);
  }
  assert.equal(s.bookings.total, 55);
  assert.equal(s.trials.total, 52);
  assert.equal(s.courses.total, 3);
  assert.deepEqual(s.activity.omitted, ['account', 'newsletter']);
  assert.ok(s.activity.events.every((e) => e.type === 'booking' || e.type === 'trial'));
});

test('a viewer (read-only on users, courses, payments and bookings) gets every section', async () => {
  await seedAll();
  const { body } = await getStats(await adminCookie('viewer'));
  for (const [key, value] of Object.entries(body.sections)) assert.equal(value.status, 'ok', key);
  assert.deepEqual(body.sections.activity.omitted, []);
});

test('one section failing is reported as an error; the others still load', async () => {
  await seedAll();
  const original = models.TrialRequest.aggregate;
  models.TrialRequest.aggregate = () => Promise.reject(new Error('simulated outage'));
  try {
    const res = await getStats(await adminCookie());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sections.trials, { status: 'error' });
    assert.equal(res.body.sections.users.total, 60);
    assert.equal(res.body.sections.bookings.total, 55);
  } finally {
    models.TrialRequest.aggregate = original;
  }
});

test('recent activity: the ten newest events across accounts, bookings, trials and newsletter, newest first', async () => {
  const now = Date.now();
  const at = (minutesAgo) => new Date(now - minutesAgo * 60 * 1000);
  await models.User.collection.insertMany(times(6, (i) => ({ name: `Acc ${i}`, email: email('acc'), password: 'x', createdAt: at(10 + i) })));
  await models.Enrollment.collection.insertMany(times(6, (i) => ({ name: `Book ${i}`, email: email('bk'), status: 'pending', plan: 'Standard', bookingRef: `AR-${i}`, createdAt: at(1 + i * 3) })));
  await models.TrialRequest.collection.insertMany(times(6, (i) => ({ name: `Trial ${i}`, email: email('tr'), course: 'Tajweed', status: 'new', createdAt: at(2 + i * 3) })));
  await models.Subscriber.collection.insertMany(times(4, (i) => ({ email: email('nl'), createdAt: at(i) })));

  const { body } = await getStats(await adminCookie());
  const { events, omitted } = body.sections.activity;
  assert.deepEqual(omitted, []);
  assert.equal(events.length, 10);
  const timesMs = events.map((e) => new Date(e.createdAt).getTime());
  assert.deepEqual(timesMs, [...timesMs].sort((a, b) => b - a));
  const booking = events.find((e) => e.type === 'booking');
  assert.equal(booking.bookingRef, 'AR-0');
  assert.equal(booking.status, 'pending');
  const trial = events.find((e) => e.type === 'trial');
  assert.equal(trial.course, 'Tajweed');
  assert.ok(events.some((e) => e.type === 'newsletter' && e.email));
  assert.ok(events.every((e) => !('password' in e)));
});

// Seeds each source with records at the given minutes-ago (all distinct, so
// the order is exact) and returns the full list, newest first: what a sort
// of every record would give.
async function seedActivity(minutesBySource) {
  const now = Date.now();
  const at = (m) => new Date(now - m * 60 * 1000);
  const all = [];
  const add = (type, m, extra) => { all.push({ type, m }); return { email: email(type), createdAt: at(m), ...extra }; };
  const { account = [], booking = [], trial = [], newsletter = [] } = minutesBySource;
  if (account.length) await models.User.collection.insertMany(account.map((m) => add('account', m, { name: `Acc ${m}`, password: 'x' })));
  if (booking.length) await models.Enrollment.collection.insertMany(booking.map((m) => add('booking', m, { name: `Book ${m}`, status: 'pending', bookingRef: `AR-${m}` })));
  if (trial.length) await models.TrialRequest.collection.insertMany(trial.map((m) => add('trial', m, { name: `Trial ${m}`, status: 'new' })));
  if (newsletter.length) await models.Subscriber.collection.insertMany(newsletter.map((m) => add('newsletter', m)));
  return all.sort((a, b) => a.m - b.m);
}

const minutesAgo = (e) => Math.round((Date.now() - new Date(e.createdAt).getTime()) / 60000);
const range = (from, count, step = 1) => Array.from({ length: count }, (_, i) => from + i * step);

test('recent activity: when the ten newest are all bookings, all ten are shown', async () => {
  await seedActivity({ booking: range(1, 12), account: range(20, 5), trial: range(30, 5), newsletter: range(40, 5) });
  const { body } = await getStats(await adminCookie());
  const { events } = body.sections.activity;
  assert.equal(events.length, 10);
  assert.ok(events.every((e) => e.type === 'booking'), events.map((e) => e.type).join());
  assert.deepEqual(events.map(minutesAgo), range(1, 10));
});

test('recent activity: when the ten newest are all newsletter sign-ups, all ten are shown', async () => {
  await seedActivity({ newsletter: range(1, 11), booking: range(20, 3), account: range(30, 3) });
  const { body } = await getStats(await adminCookie());
  assert.deepEqual(body.sections.activity.events.map((e) => e.type), Array(10).fill('newsletter'));
});

test('recent activity matches a full sort of every record, for interleaved sources', async () => {
  const all = await seedActivity({
    account: [2, 3, 5, 7, 11, 13, 17],
    booking: [1, 4, 6, 8, 19, 23],
    trial: [9, 10, 12, 14, 15, 16, 18],
    newsletter: [20, 21, 22],
  });
  const { body } = await getStats(await adminCookie());
  const got = body.sections.activity.events.map((e) => ({ type: e.type, m: minutesAgo(e) }));
  assert.deepEqual(got, all.slice(0, 10));
});

test('recent activity: the newest ten among the sources the admin may read only', async () => {
  // Accounts and newsletter sign-ups are the newest, but an editor may not
  // read them; it must still get ten bookings and trials, newest first.
  const all = await seedActivity({ account: range(1, 10), newsletter: range(11, 5), booking: range(20, 8, 2), trial: range(21, 8, 2) });
  const { body } = await getStats(await adminCookie('editor'));
  const { events, omitted } = body.sections.activity;
  assert.deepEqual(omitted, ['account', 'newsletter']);
  const expected = all.filter((e) => e.type === 'booking' || e.type === 'trial').slice(0, 10);
  assert.deepEqual(events.map((e) => ({ type: e.type, m: minutesAgo(e) })), expected);
});

test('an empty database gives real zeros, with every section loaded', async () => {
  const { body } = await getStats(await adminCookie());
  for (const [key, value] of Object.entries(body.sections)) assert.equal(value.status, 'ok', key);
  assert.equal(body.sections.users.total, 0);
  assert.deepEqual(body.sections.bookingPayments.paidByCurrency, []);
  assert.deepEqual(body.sections.activity.events, []);
});

test('the route sits behind the admin session, MFA and the IP allowlist', async () => {
  await seedAll();
  const noSession = await getStats(null);
  assert.equal(noSession.status, 401);
  assert.equal(noSession.body.sections, undefined);

  const notVerified = await getStats(await adminCookie('admin', { mfaVerified: false }));
  assert.equal(notVerified.status, 403);
  assert.equal(notVerified.body.sections, undefined);

  const otherIp = await getStats(await adminCookie(), { ip: OTHER_IP });
  assert.equal(otherIp.status, 403);
  assert.equal(otherIp.body.sections, undefined);
});

// ── Service status (GET /api/v1/admin/stats/service-status) ────────────────
// The server's own commit, a database ping, and main on GitHub's public API.
// GitHub is replaced by a stand-in that answers by path, counts the calls
// and refuses every other host, so nothing leaves this machine. A missing
// or failed fact must come back as "unknown" with its reason, never as "no
// deploy needed".

const SERVICE_PATH = '/api/v1/admin/stats/service-status';
const REPO_PATH = '/repos/samy37785-cmd/Alrahma';
const SERVER_SHA = '0af5fa7c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a';
const MAIN_SHA = '9be0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8';
const MAIN_PATH = `${REPO_PATH}/commits/main`;
const COMPARE = `${REPO_PATH}/compare/${SERVER_SHA}...${MAIN_SHA}`;
const mainCommit = (sha = MAIN_SHA) => ({ body: { sha, commit: { committer: { date: '2026-10-20T15:39:30Z' } } } });

function getServiceStatus(cookie, { ip = ALLOWED_IP } = {}) {
  const req = request(app).get(SERVICE_PATH).set('X-Forwarded-For', ip);
  return cookie ? req.set('Cookie', cookie) : req;
}

function fakeGitHub(t, routes) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(String(url));
    if (u.host !== 'api.github.com') throw new Error(`unexpected request to ${u.host}`);
    calls.push(u.pathname);
    const route = routes[u.pathname];
    if (route instanceof Error) throw route;
    const { status = 200, body = { message: 'Not Found' }, headers = {} } = route ?? { status: 404 };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  });
  return calls;
}

function runningCommit(t, sha) {
  const saved = process.env.RENDER_GIT_COMMIT;
  if (sha === undefined) delete process.env.RENDER_GIT_COMMIT;
  else process.env.RENDER_GIT_COMMIT = sha;
  t.after(() => {
    if (saved === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = saved;
  });
}

async function serviceStatus(t, { server, routes }) {
  resetServiceStatusCache();
  runningCommit(t, server);
  const calls = fakeGitHub(t, routes);
  const res = await getServiceStatus(await adminCookie());
  assert.equal(res.status, 200);
  return { body: res.body, calls, res };
}

test("service status: the server runs main's commit: up to date, with a timed database ping", async (t) => {
  const { body, calls, res } = await serviceStatus(t, { server: MAIN_SHA, routes: { [MAIN_PATH]: mainCommit() } });
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(body.server.commit, MAIN_SHA);
  assert.deepEqual({ ...body.main, fetchedAt: undefined }, { status: 'ok', commit: MAIN_SHA, committedAt: '2026-10-20T15:39:30Z', fetchedAt: undefined });
  assert.deepEqual(body.serverDeploy, { verdict: 'up_to_date' });
  assert.equal(body.database.status, 'ok');
  assert.ok(Number.isInteger(body.database.latencyMs) && body.database.latencyMs >= 1);
  assert.ok(!Number.isNaN(Date.parse(body.database.checkedAt)));
  assert.deepEqual(calls, [MAIN_PATH], 'no comparison when the commits match');
});

test('service status: server files changed since the running commit: a deploy is probably needed, with the list', async (t) => {
  const files = [
    { filename: 'artifacts/al-rahma-academy/src/App.jsx' },
    { filename: 'backend/app.js' },
    { filename: 'docs/notes.md' },
    { filename: 'scripts/moved.js', previous_filename: 'backend/moved.js' },
    { filename: 'backend/tests/app.test.js' },
  ];
  const { body } = await serviceStatus(t, { server: SERVER_SHA, routes: {
    [MAIN_PATH]: mainCommit(),
    [COMPARE]: { body: { status: 'ahead', ahead_by: 3, files } },
  } });
  assert.deepEqual({ ...body.serverDeploy, comparedAt: undefined }, {
    verdict: 'likely_needed', commitsBehind: 3, changedFiles: 5, listComplete: true, comparedAt: undefined,
    serverFileCount: 2, serverFiles: ['backend/app.js', 'scripts/moved.js'],
  });
});

test('service status: only website, docs or server-test files changed: no server change (not proof), never "up to date"', async (t) => {
  const files = [{ filename: 'artifacts/al-rahma-academy/src/App.jsx' }, { filename: 'README.md' }, { filename: 'backend/tests/app.test.js' }];
  const { body } = await serviceStatus(t, { server: SERVER_SHA, routes: {
    [MAIN_PATH]: mainCommit(),
    [COMPARE]: { body: { status: 'ahead', ahead_by: 2, files } },
  } });
  assert.equal(body.serverDeploy.verdict, 'no_server_changes');
  assert.equal(body.serverDeploy.listComplete, true);
  assert.equal(body.serverDeploy.commitsBehind, 2);
});

test('service status: a list GitHub may have cut short (300 files) proves nothing unless it already shows a server file', async (t) => {
  const site = Array.from({ length: 300 }, (_, i) => ({ filename: `artifacts/al-rahma-academy/src/f${i}.jsx` }));
  const first = await serviceStatus(t, { server: SERVER_SHA, routes: {
    [MAIN_PATH]: mainCommit(),
    [COMPARE]: { body: { status: 'ahead', ahead_by: 400, files: site } },
  } });
  assert.equal(first.body.serverDeploy.verdict, 'unknown');
  assert.equal(first.body.serverDeploy.reason, 'compare_incomplete');

  t.mock.restoreAll();
  const withServer = [...site.slice(1), { filename: 'backend/server.js' }];
  const second = await serviceStatus(t, { server: SERVER_SHA, routes: {
    [MAIN_PATH]: mainCommit(),
    [COMPARE]: { body: { status: 'ahead', ahead_by: 400, files: withServer } },
  } });
  assert.equal(second.body.serverDeploy.verdict, 'likely_needed');
  assert.equal(second.body.serverDeploy.listComplete, false);
});

test('service status: a server commit main does not contain, or GitHub does not know, is unknown', async (t) => {
  for (const [answer, reason] of [
    [{ body: { status: 'diverged', ahead_by: 1, behind_by: 2, files: [] } }, 'server_commit_not_on_main'],
    [{ body: { status: 'behind', ahead_by: 0, behind_by: 1, files: [] } }, 'server_commit_not_on_main'],
    [{ status: 404 }, 'server_commit_not_found'],
  ]) {
    t.mock.restoreAll();
    const { body } = await serviceStatus(t, { server: SERVER_SHA, routes: { [MAIN_PATH]: mainCommit(), [COMPARE]: answer } });
    assert.deepEqual(body.serverDeploy, { verdict: 'unknown', reason }, reason);
  }
});

test('service status: a missing or malformed server commit is unknown, and nothing is compared', async (t) => {
  for (const server of [undefined, '', 'not-a-commit', 'abc12']) {
    t.mock.restoreAll();
    const { body, calls } = await serviceStatus(t, { server, routes: { [MAIN_PATH]: mainCommit() } });
    assert.equal(body.server.commit, null, String(server));
    assert.deepEqual(body.serverDeploy, { verdict: 'unknown', reason: 'server_commit_unknown' });
    assert.equal(body.main.status, 'ok', 'main is still shown');
    assert.deepEqual(calls, [MAIN_PATH]);
  }
});

test('service status: GitHub failing makes main and the deploy question unknown; the database check still answers', async (t) => {
  for (const [answer, reason] of [
    [new TypeError('fetch failed'), 'github_unreachable'],
    [{ status: 403, headers: { 'x-ratelimit-remaining': '0' }, body: { message: 'API rate limit exceeded for 1.2.3.4' } }, 'github_rate_limited'],
    [{ status: 500, body: { message: 'internal detail that must not be passed on' } }, 'github_http_500'],
    [{ body: { sha: 'not a sha' } }, 'github_bad_answer'],
  ]) {
    t.mock.restoreAll();
    const { body } = await serviceStatus(t, { server: SERVER_SHA, routes: { [MAIN_PATH]: answer } });
    assert.deepEqual(body.main, { status: 'unknown', reason }, reason);
    assert.deepEqual(body.serverDeploy, { verdict: 'unknown', reason }, reason);
    assert.equal(body.database.status, 'ok');
    const text = JSON.stringify(body);
    assert.ok(!text.includes('1.2.3.4') && !text.includes('internal detail'), "GitHub's own text is never passed on");
  }
});

test('service status: GitHub answers are kept for a while, so repeated checks do not call it again', async (t) => {
  resetServiceStatusCache();
  runningCommit(t, SERVER_SHA);
  const calls = fakeGitHub(t, {
    [MAIN_PATH]: mainCommit(),
    [COMPARE]: { body: { status: 'ahead', ahead_by: 1, files: [{ filename: 'backend/app.js' }] } },
  });
  const cookie = await adminCookie();
  for (let i = 0; i < 3; i++) assert.equal((await getServiceStatus(cookie)).body.serverDeploy.verdict, 'likely_needed');
  assert.deepEqual(calls, [MAIN_PATH, COMPARE], 'one call per GitHub path for three checks');

  resetServiceStatusCache();
  await getServiceStatus(cookie);
  assert.equal(calls.length, 4, 'asked again once the kept answers are gone');
});

test('service status: a failed database ping is reported as an error, and the rest still answers', async (t) => {
  resetServiceStatusCache();
  runningCommit(t, MAIN_SHA);
  fakeGitHub(t, { [MAIN_PATH]: mainCommit() });
  const Admin = Object.getPrototypeOf(mongoose.connection.db.admin());
  t.mock.method(Admin, 'ping', async () => { throw new Error('simulated outage'); });
  const res = await getServiceStatus(await adminCookie());
  assert.equal(res.status, 200);
  assert.equal(res.body.database.status, 'error');
  assert.equal(res.body.database.reason, 'ping_failed');
  assert.equal(res.body.database.latencyMs, undefined);
  assert.deepEqual(res.body.serverDeploy, { verdict: 'up_to_date' });
});

test('service status: needs an MFA session from the allowlist and audit:read; nothing is asked of GitHub otherwise', async (t) => {
  resetServiceStatusCache();
  runningCommit(t, MAIN_SHA);
  const calls = fakeGitHub(t, { [MAIN_PATH]: mainCommit() });

  assert.equal((await getServiceStatus(null)).status, 401);
  assert.equal((await getServiceStatus(await adminCookie('admin', { mfaVerified: false }))).status, 403);
  assert.equal((await getServiceStatus(await adminCookie(), { ip: OTHER_IP })).status, 403);
  const editor = await getServiceStatus(await adminCookie('editor'));
  assert.equal(editor.status, 403);
  assert.deepEqual(editor.body.required, ['audit:read']);
  assert.deepEqual(calls, [], 'a refused request never reaches GitHub');

  for (const role of ['viewer', 'admin', 'super-admin']) {
    assert.equal((await getServiceStatus(await adminCookie(role))).status, 200, role);
  }
});
