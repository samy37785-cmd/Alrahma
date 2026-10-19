import {
  Users, CheckCircle, CalendarCheck, CreditCard, Target, Mail, Archive,
  BookOpen, Activity, BarChart3, TrendingUp,
} from 'lucide-react';
import { DsBarChart, DsAreaChart, DsChartEmpty } from '../../ui/DsChart';

// The Overview tab. Every figure comes from GET /v1/admin/stats/overview,
// which counts over all records in MongoDB (see backend
// controllers/adminOverviewController.js). A section the admin may not see,
// or that failed to load, shows "—" and the reason, never a 0.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
const count = (n) => Number(n).toLocaleString('en-GB');

function money(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${count(amount)}`;
  }
}

const BOOKING_STATUS_LABEL = {
  pending: 'new', contacted: 'contacted', awaiting_payment: 'awaiting payment',
  paid: 'paid', enrolled: 'enrolled', cancelled: 'cancelled',
};

const REASON = {
  forbidden: 'No permission to view',
  unavailable: 'Could not load',
  loading: 'Loading…',
};

// { state: 'ok', data } | { state: 'forbidden' | 'unavailable' | 'loading' }
function readSection(stats, key, { isLoading, failed }) {
  if (isLoading) return { state: 'loading' };
  if (failed) return { state: 'unavailable' };
  const s = stats?.sections?.[key];
  if (s?.status === 'ok') return { state: 'ok', data: s };
  if (s?.status === 'forbidden') return { state: 'forbidden' };
  return { state: 'unavailable' };
}

function StatCard({ id, Icon, tone, label, section, value, sub }) {
  const ok = section.state === 'ok';
  return (
    <div className="ds-stat" data-testid={`stat-${id}`} data-state={section.state}>
      <div className="ds-stat__top">
        <div className={`ds-stat__icon ds-stat__icon--${tone}`}>
          <Icon size={18} aria-hidden="true" />
        </div>
      </div>
      <div className="ds-stat__value">{ok ? value(section.data) : '—'}</div>
      <div className="ds-stat__label">{label}</div>
      <div className="ds-stat__sub">{ok ? sub(section.data) : REASON[section.state]}</div>
    </div>
  );
}

function MonthChart({ section, pick, months, kind, label, color, empty }) {
  if (section.state !== 'ok') return <DsChartEmpty height={120} message={REASON[section.state]} />;
  const series = pick(section.data);
  const data = series.map((m) => ({ label: monthLabel(m.month), [label]: m.count }));
  const total = series.reduce((n, m) => n + m.count, 0);
  if (total === 0) return <DsChartEmpty height={120} message={empty} />;
  return kind === 'area'
    ? <DsAreaChart data={data} areas={[{ key: label, label, color }]} height={130} showGrid />
    : <DsBarChart data={data} bars={[{ key: label, label, color }]} height={140} showGrid />;
}

function ChartCard({ Icon, title, note, children }) {
  return (
    <div className="ds-card">
      <div className="ds-card__hd">
        <span className="ds-card__title">
          <span className="ds-card__title-icon"><Icon size={14} aria-hidden="true" /></span> {title}
        </span>
      </div>
      <div className="ds-card__body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {children}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{note}</div>
        </div>
      </div>
    </div>
  );
}

const ACTIVITY_TYPE_LABEL = { account: 'accounts', booking: 'bookings', trial: 'trial requests', newsletter: 'newsletter sign-ups' };

function describeEvent(ev) {
  if (ev.type === 'account') return { title: `${ev.name || 'Someone'} created an account`, desc: ev.email, Icon: Users };
  if (ev.type === 'booking') {
    return {
      title: `Booking request — ${ev.plan || 'no plan chosen'}`,
      desc: [ev.name || ev.email, BOOKING_STATUS_LABEL[ev.status] || ev.status, ev.bookingRef].filter(Boolean).join(' · '),
      Icon: CalendarCheck,
    };
  }
  if (ev.type === 'trial') return { title: `Trial request — ${ev.course || 'no course named'}`, desc: ev.name || ev.email, Icon: Target };
  return { title: 'Newsletter sign-up', desc: ev.email, Icon: Mail };
}

function ActivityList({ section }) {
  if (section.state !== 'ok') {
    return <div className="ds-empty" style={{ padding: '20px 0' }}><div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>{REASON[section.state]}</div></div>;
  }
  const { events, omitted } = section.data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {events.length === 0 ? (
        <div className="ds-empty" style={{ padding: '20px 0' }}>
          <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1rem' }}>📋</div>
          <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No recent activity</div>
        </div>
      ) : (
        <div className="ds-timeline">
          {events.map((ev) => {
            const { title, desc, Icon } = describeEvent(ev);
            return (
              <div key={`${ev.type}-${ev._id}`} className="ds-timeline__item" data-testid={`activity-${ev.type}`}>
                <div className="ds-timeline__left">
                  <div className="ds-timeline__dot"><Icon size={14} aria-hidden="true" /></div>
                  <div className="ds-timeline__line" />
                </div>
                <div className="ds-timeline__body">
                  <div className="ds-timeline__title">{title}</div>
                  {desc && <div className="ds-timeline__desc">{desc}</div>}
                  {ev.createdAt && (
                    <div className="ds-timeline__time">
                      {new Date(ev.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {omitted.length > 0 && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Not included: {omitted.map((t) => ACTIVITY_TYPE_LABEL[t] || t).join(', ')} (no permission, or could not load).
        </div>
      )}
    </div>
  );
}

function PaidByCurrency({ rows }) {
  if (rows.length === 0) return 'None yet';
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.2, fontSize: rows.length > 1 ? '1.15rem' : undefined }}>
      {rows.map((r) => <span key={r.currency}>{money(r.amount, r.currency)}</span>)}
    </span>
  );
}

export default function AdminOverviewPanel({ stats, isLoading = false, error = null, onNavigate }) {
  const opts = { isLoading, failed: Boolean(error) };
  const s = (key) => readSection(stats, key, opts);
  const users = s('users');
  const subscriptions = s('subscriptions');
  const bookings = s('bookings');
  const bookingPayments = s('bookingPayments');
  const trials = s('trials');
  const newsletter = s('newsletter');
  const legacy = s('legacyManualPayments');
  const courses = s('courses');
  const activity = s('activity');

  const httpStatus = error?.response?.status;
  const newBookings = bookings.state === 'ok' ? bookings.data.byStatus.pending : null;
  const newTrials = trials.state === 'ok' ? trials.data.byStatus.new : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && (
        <div role="alert" style={{
          background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
          borderRadius: 9, padding: '10px 14px', fontSize: '0.855rem', color: 'var(--color-danger-text)',
        }}>
          The overview figures could not be loaded{httpStatus ? ` (HTTP ${httpStatus})` : ''}. None of the cards below show real numbers until they load.
        </div>
      )}

      <div className="ds-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
        <StatCard id="accounts" Icon={Users} tone="blue" label="Accounts" section={users}
          value={(d) => count(d.total)}
          sub={() => 'Every registered account, including any test accounts'} />
        <StatCard id="paid-access" Icon={CheckCircle} tone="green" label="Paid access now" section={subscriptions}
          value={(d) => count(d.active)}
          sub={(d) => `Subscription active and not past its end date${d.markedActiveButExpired ? ` · ${count(d.markedActiveButExpired)} more marked active but expired` : ''}`} />
        <StatCard id="bookings" Icon={CalendarCheck} tone="teal" label="Booking requests" section={bookings}
          value={(d) => count(d.total)}
          sub={(d) => `${count(d.byStatus.pending)} new · ${count(d.byStatus.awaiting_payment)} awaiting payment · ${count(d.byStatus.enrolled)} enrolled`} />
        <StatCard id="booking-payments" Icon={CreditCard} tone="gold" label="Payments recorded on bookings" section={bookingPayments}
          value={(d) => <PaidByCurrency rows={d.paidByCurrency} />}
          sub={(d) => {
            const n = d.paidByCurrency.reduce((sum, r) => sum + r.count, 0);
            const parts = [`${count(n)} booking${n === 1 ? '' : 's'} marked paid or enrolled with amount, currency and payment date`];
            if (d.paidMissingDetails) parts.push(`${count(d.paidMissingDetails)} marked paid without those details, not counted`);
            return parts.join(' · ');
          }} />
        <StatCard id="trials" Icon={Target} tone="purple" label="Trial requests" section={trials}
          value={(d) => count(d.total)}
          sub={(d) => `${count(d.byStatus.new)} new · ${count(d.byStatus.contacted)} contacted · ${count(d.byStatus.scheduled)} scheduled`} />
        <StatCard id="newsletter" Icon={Mail} tone="blue" label="Newsletter" section={newsletter}
          value={(d) => count(d.total)}
          sub={() => 'Email subscribers'} />
        <StatCard id="legacy-payments" Icon={Archive} tone="red" label="Old manual payments" section={legacy}
          value={(d) => count(d.total)}
          sub={(d) => `${count(d.byStatus.pending)} pending review · old payment form, now closed; not booking income`} />
      </div>

      {!error && stats?.generatedAt && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: -8 }}>
          Counted on the server over all records at {new Date(stats.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.
          Months follow the {stats.timeZone} time zone. Amounts in different currencies are never added together.
        </div>
      )}

      <div className="ds-grid ds-grid-main-side">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ChartCard Icon={CalendarCheck} title="Booking Requests — Last 6 Months" note="By the date each request was sent">
            <MonthChart section={bookings} pick={(d) => d.newByMonth} label="Bookings" color="#0d9488" empty="No booking requests in this period" />
          </ChartCard>

          <ChartCard Icon={CreditCard} title="Payments Recorded on Bookings — Last 6 Months"
            note="Number of payments by payment date (not amounts, which are in different currencies)">
            <MonthChart section={bookingPayments} pick={(d) => d.paidByMonth} label="Payments" color="#0b6e4f" empty="No payments recorded in this period" />
          </ChartCard>

          <ChartCard Icon={TrendingUp} title="New Accounts — Last 7 Months" note="Every registered account, by sign-up date">
            <MonthChart section={users} pick={(d) => d.newByMonth} kind="area" label="Accounts" color="#2176c7" empty="No new accounts in this period" />
          </ChartCard>

          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title">
                <span className="ds-card__title-icon"><BookOpen size={14} aria-hidden="true" /></span>
                {' '}Course Catalogue{courses.state === 'ok' ? ` (${courses.data.total})` : ''}
              </span>
              <button className="ds-card__link" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-brand)' }} onClick={() => onNavigate('courses')}>
                Manage →
              </button>
            </div>
            <div className="ds-card__body">
              {courses.state !== 'ok' ? (
                <div className="ds-empty" style={{ padding: '20px 0' }}><div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>{REASON[courses.state]}</div></div>
              ) : courses.data.items.length === 0 ? (
                <div className="ds-empty" style={{ padding: '20px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1rem' }}>📚</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No courses yet</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {courses.data.items.map((c) => (
                    <div key={c._id} data-testid="overview-course" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{c.icon || '📘'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.855rem', color: 'var(--text-primary)' }}>{c.title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          {count(c.modules)} module{c.modules === 1 ? '' : 's'} · {count(c.lessons)} lesson{c.lessons === 1 ? '' : 's'}
                        </div>
                      </div>
                      {!c.published && <span className="ds-badge ds-badge--yellow">Hidden</span>}
                      <span className="ds-badge ds-badge--gray">{c.level || 'All levels'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title">
                <span className="ds-card__title-icon"><Activity size={14} aria-hidden="true" /></span> Recent Activity
              </span>
            </div>
            <div className="ds-card__body">
              <ActivityList section={activity} />
            </div>
          </div>

          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title">
                <span className="ds-card__title-icon"><BarChart3 size={14} aria-hidden="true" /></span> Quick Actions
              </span>
            </div>
            <div className="ds-card__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { Icon: CalendarCheck, label: newBookings === null ? 'Review Bookings' : `Review Bookings (${count(newBookings)} new)`, tab: 'bookings', badge: newBookings > 0 },
                  { Icon: Target, label: newTrials === null ? 'Trial Requests' : `Trial Requests (${count(newTrials)} new)`, tab: 'trials', badge: newTrials > 0 },
                  { Icon: Users, label: 'Manage Users', tab: 'users' },
                  { Icon: BookOpen, label: 'Manage Courses', tab: 'courses' },
                ].map((a) => (
                  <button key={a.tab} className="ds-quick-action" onClick={() => onNavigate(a.tab)} style={{ width: '100%' }}>
                    <span className="ds-quick-action__icon"><a.Icon size={15} aria-hidden="true" /></span>
                    <span className="ds-quick-action__label">{a.label}</span>
                    {a.badge && <span className="ds-badge ds-badge--red" style={{ marginLeft: 'auto', fontSize: '0.62rem' }} aria-label="Needs attention">!</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
