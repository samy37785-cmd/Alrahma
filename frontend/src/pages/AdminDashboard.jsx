import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen, CreditCard, Target, UserCog,
  Mail, Settings, TrendingUp, BarChart3, Activity, CheckCircle,
  RefreshCw, Download, CalendarDays,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCourses } from '../api/courseApi';
import { getManualPayments } from '../api/paymentApi';
import { getUsers, listTeachers } from '../api/adminApi';
import { getTrials, getSubscribers } from '../api/contentApi';
import AdminCoursesTab    from '../components/features/admin/AdminCoursesTab';
import AdminTrialsTab     from '../components/features/admin/AdminTrialsTab';
import AdminPaymentsTab   from '../components/features/admin/AdminPaymentsTab';
import AdminNewsletterTab from '../components/features/admin/AdminNewsletterTab';
import AdminUsersTab      from '../components/features/admin/AdminUsersTab';
import AdminStaffTab      from '../components/features/admin/AdminStaffTab';
import AdminClassesTab   from '../components/features/admin/AdminClassesTab';
import AdminProgressModal from '../components/features/admin/AdminProgressModal';
import DashboardLayout    from '../components/layout/DashboardLayout';
import { DsBarChart, DsAreaChart, DsChartEmpty } from '../components/ui/DsChart';
import { getNameInitials } from '../utils/nameInitials';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildMonthBars(items, months, valueKey, filterFn) {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const count = items.filter((item) => {
      const pd = new Date(item[valueKey] || item.date || item.createdAt);
      return pd.getFullYear() === d.getFullYear()
        && pd.getMonth() === d.getMonth()
        && (filterFn ? filterFn(item) : true);
    }).length;
    return { label: MONTHS[d.getMonth()], Payments: count, Users: count };
  });
}

function RevenueChart({ pays }) {
  const data = useMemo(() => buildMonthBars(
    pays, 6, 'createdAt', (p) => p.status === 'approved', null
  ).map((d) => ({ label: d.label, Payments: d.Payments })), [pays]);

  const total = data.reduce((s, d) => s + d.Payments, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {total === 0
        ? <DsChartEmpty height={120} message="No approved payments yet" />
        : <DsBarChart
            data={data}
            bars={[{ key: 'Payments', label: 'Approved Payments', color: '#0b6e4f' }]}
            height={140}
            showGrid
          />
      }
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        Approved payments last 6 months · {total} total
      </div>
    </div>
  );
}

function UserGrowthChart({ users }) {
  const data = useMemo(() => buildMonthBars(
    users, 7, 'createdAt', null, null
  ).map((d) => ({ label: d.label, Users: d.Users })), [users]);

  const total = data.reduce((s, d) => s + d.Users, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {total === 0
        ? <DsChartEmpty height={110} message="No registrations in this period" />
        : <DsAreaChart
            data={data}
            areas={[{ key: 'Users', label: 'New Users', color: '#2176c7' }]}
            height={130}
            showGrid
          />
      }
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        New registrations · {total} last 7 months
      </div>
    </div>
  );
}

function FeedIcon({ type }) {
  if (type === 'user')    return <Users size={14} aria-hidden="true" />;
  if (type === 'payment') return <CreditCard size={14} aria-hidden="true" />;
  return <Target size={14} aria-hidden="true" />;
}

function ActivityFeed({ users, pays, trials }) {
  const events = [
    ...users.slice(0, 5).map((u) => ({
      id: u._id, type: 'user',
      title: `${u.name} registered`,
      desc: u.email,
      time: u.createdAt,
      color: 'ds-badge--blue',
    })),
    ...pays.filter((p) => p.status === 'pending').slice(0, 4).map((p) => ({
      id: p._id, type: 'payment',
      title: `Payment pending — ${p.plan || ''}`,
      desc: `${p.name || p.userEmail || ''}`,
      time: p.createdAt || p.date,
      color: 'ds-badge--yellow',
    })),
    ...trials.slice(0, 3).map((t) => ({
      id: t._id, type: 'trial',
      title: `Trial request — ${t.courseName || ''}`,
      desc: t.name || t.email || '',
      time: t.createdAt || t.date,
      color: 'ds-badge--purple',
    })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);

  if (events.length === 0) {
    return (
      <div className="ds-empty" style={{ padding: '20px 0' }}>
        <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1rem' }}>📋</div>
        <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No recent activity</div>
      </div>
    );
  }

  return (
    <div className="ds-timeline">
      {events.map((ev) => (
        <div key={ev.id + ev.type} className="ds-timeline__item">
          <div className="ds-timeline__left">
            <div className="ds-timeline__dot"><FeedIcon type={ev.type} /></div>
            <div className="ds-timeline__line" />
          </div>
          <div className="ds-timeline__body">
            <div className="ds-timeline__title">{ev.title}</div>
            <div className="ds-timeline__desc">{ev.desc}</div>
            {ev.time && (
              <div className="ds-timeline__time">
                {new Date(ev.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { key: 'overview',    label: 'Overview',    Icon: LayoutDashboard },
  { key: 'users',       label: 'Users',       Icon: Users },
  { key: 'courses',     label: 'Courses',     Icon: BookOpen },
  { key: 'payments',    label: 'Payments',    Icon: CreditCard },
  { key: 'trials',      label: 'Trials',      Icon: Target },
  { key: 'newsletter',  label: 'Newsletter',  Icon: Mail },
  { key: 'staff',       label: 'Staff',       Icon: UserCog },
  { key: 'classes',     label: 'Classes',     Icon: CalendarDays },
];

export default function AdminDashboard() {
  useAuth();
  const queryClient = useQueryClient();

  const [error,      setError]      = useState('');
  const [activeTab,  setActiveTab]  = useState('overview');
  const [reportUser, setReportUser] = useState(null);

  const { data: courses = [], isLoading: l1 }      = useQuery({ queryKey: ['admin', 'courses'],     queryFn: getCourses,                          staleTime: 120000 });
  const { data: trials = [], isLoading: l2 }       = useQuery({ queryKey: ['admin', 'trials'],      queryFn: getTrials,                           staleTime: 60000  });
  const { data: paysRes, isLoading: l3 }           = useQuery({ queryKey: ['admin', 'payments'],    queryFn: getManualPayments,                   staleTime: 30000  });
  const { data: subscribers = [], isLoading: l4 }  = useQuery({ queryKey: ['admin', 'newsletter'],  queryFn: getSubscribers,                      staleTime: 300000 });
  const { data: usersRes, isLoading: l5 }          = useQuery({ queryKey: ['admin', 'users'],       queryFn: getUsers,                            staleTime: 60000  });
  const { data: teachers = [], isLoading: l6 }     = useQuery({ queryKey: ['admin', 'teachers'],    queryFn: () => listTeachers().catch(() => []), staleTime: 120000 });

  const manualPays      = paysRes?.data ?? paysRes ?? [];
  const manualPaysTotal = paysRes?.total ?? manualPays.length;
  const users           = usersRes?.data ?? usersRes ?? [];
  const usersTotal      = usersRes?.total ?? users.length;

  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  const setCourses  = (updater) => queryClient.setQueryData(['admin', 'courses'],    updater);
  const setManualPays = (updater) => queryClient.setQueryData(['admin', 'payments'], (old) => {
    const prev = old?.data ?? old ?? [];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    return old?.data !== undefined ? { ...old, data: next } : next;
  });
  const setUsers    = (updater) => queryClient.setQueryData(['admin', 'users'],      (old) => {
    const prev = old?.data ?? old ?? [];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    return old?.data !== undefined ? { ...old, data: next } : next;
  });

  const loadAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    setError('');
  };

  /* KPIs */
  const students         = users.filter((u) => u.role === 'student');
  const activeStudents   = students.filter((u) => u.subscription?.status === 'active');
  const pendingPayments  = manualPays.filter((p) => p.status === 'pending');
  const conversionRate   = trials.length
    ? Math.round((activeStudents.length / Math.max(trials.length, 1)) * 100)
    : 0;

  /* Tab badge counts */
  const tabBadge = (key) => {
    if (key === 'payments') return pendingPayments.length;
    if (key === 'trials')   return trials.filter((t) => t.status === 'pending').length;
    return 0;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="ds-skel" style={{ display: 'block', width: 200, height: 28, borderRadius: 6, marginBottom: 8 }} />
            <div className="ds-skel" style={{ display: 'block', width: 340, height: 14, borderRadius: 4 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 14 }}>
            {[1,2,3,4,5].map((k) => (
              <div key={k} className="ds-skel-stat">
                <div className="ds-skel" style={{ display: 'block', width: 38, height: 38, borderRadius: 10, marginBottom: 14 }} />
                <div className="ds-skel" style={{ display: 'block', width: 80, height: 28, borderRadius: 6, marginBottom: 6 }} />
                <div className="ds-skel" style={{ display: 'block', width: 110, height: 12, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="ds-page-hd">
        <div>
          <div className="ds-page-hd__eyebrow"><Settings size={12} aria-hidden="true" /> Admin Console</div>
          <h1 className="ds-page-hd__title">Platform Overview</h1>
          <p className="ds-page-hd__sub">
            {usersTotal} total users · {activeStudents.length} active students · {teachers.length} teachers
          </p>
        </div>
        <div className="ds-page-hd__actions">
          <button className="btn btn--green btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }} onClick={loadAll}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
          borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: '0.855rem', color: 'var(--color-danger-text)',
        }}>
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div
        role="tablist"
        aria-label="Admin sections"
        style={{
          display: 'flex', gap: 4, padding: '4px', background: 'var(--bg-page)',
          border: '1px solid var(--border-default)', borderRadius: 11, marginBottom: 22,
          overflowX: 'auto', flexWrap: 'nowrap',
        }}
        onKeyDown={(e) => {
          const idx = TABS.findIndex((t) => t.key === activeTab);
          if (e.key === 'ArrowRight') { e.preventDefault(); setActiveTab(TABS[(idx + 1) % TABS.length].key); }
          if (e.key === 'ArrowLeft')  { e.preventDefault(); setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length].key); }
          if (e.key === 'Home') { e.preventDefault(); setActiveTab(TABS[0].key); }
          if (e.key === 'End')  { e.preventDefault(); setActiveTab(TABS[TABS.length - 1].key); }
        }}
      >
        {TABS.map((tab) => {
          const badge = tabBadge(tab.key);
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                background: isActive ? 'var(--bg-surface)' : 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                transition: 'all var(--duration-base)',
              }}
            >
              <tab.Icon size={14} aria-hidden="true" />
              <span>{tab.label}</span>
              {badge > 0 && (
                <span className="ds-badge ds-badge--red" style={{ fontSize: '0.62rem', padding: '1px 5px' }} aria-label={`${badge} pending`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
      <div id="tabpanel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={activeTab !== 'overview'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* KPI cards */}
          <div className="ds-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
            <div className="ds-stat">
              <div className="ds-stat__top">
                <div className="ds-stat__icon ds-stat__icon--blue">
                  <Users size={18} aria-hidden="true" />
                </div>
              </div>
              <div className="ds-stat__value">{usersTotal}</div>
              <div className="ds-stat__label">Total Users</div>
              <div className="ds-stat__sub">{teachers.length} teachers · {students.length} students</div>
            </div>

            <div className="ds-stat">
              <div className="ds-stat__top">
                <div className="ds-stat__icon ds-stat__icon--green">
                  <CheckCircle size={18} aria-hidden="true" />
                </div>
                <span className="ds-stat__trend ds-stat__trend--up">Active</span>
              </div>
              <div className="ds-stat__value">{activeStudents.length}</div>
              <div className="ds-stat__label">Active Students</div>
              <div className="ds-stat__sub">
                {students.length > 0 ? Math.round((activeStudents.length / students.length) * 100) : 0}% of all students
              </div>
            </div>

            <div className="ds-stat">
              <div className="ds-stat__top">
                <div className="ds-stat__icon ds-stat__icon--gold">
                  <CreditCard size={18} aria-hidden="true" />
                </div>
                {pendingPayments.length > 0 && (
                  <span className="ds-stat__trend ds-stat__trend--down">{pendingPayments.length} pending</span>
                )}
              </div>
              <div className="ds-stat__value">{manualPaysTotal}</div>
              <div className="ds-stat__label">Payments</div>
              <div className="ds-stat__sub">{pendingPayments.length} need review</div>
            </div>

            <div className="ds-stat">
              <div className="ds-stat__top">
                <div className="ds-stat__icon ds-stat__icon--purple">
                  <Target size={18} aria-hidden="true" />
                </div>
              </div>
              <div className="ds-stat__value">{trials.length}</div>
              <div className="ds-stat__label">Trial Requests</div>
              <div className="ds-stat__sub">{trials.filter((t) => t.status === 'pending').length} awaiting review</div>
            </div>

            <div className="ds-stat">
              <div className="ds-stat__top">
                <div className="ds-stat__icon ds-stat__icon--teal">
                  <TrendingUp size={18} aria-hidden="true" />
                </div>
              </div>
              <div className="ds-stat__value">{conversionRate}<span style={{ fontSize: '1rem' }}>%</span></div>
              <div className="ds-stat__label">Conversion Rate</div>
              <div className="ds-stat__sub">Trials → Active</div>
            </div>

            <div className="ds-stat">
              <div className="ds-stat__top">
                <div className="ds-stat__icon ds-stat__icon--blue">
                  <Mail size={18} aria-hidden="true" />
                </div>
              </div>
              <div className="ds-stat__value">{subscribers.length}</div>
              <div className="ds-stat__label">Newsletter</div>
              <div className="ds-stat__sub">Subscribers</div>
            </div>
          </div>

          {/* Charts + Activity */}
          <div className="ds-grid ds-grid-main-side">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Revenue trend */}
              <div className="ds-card">
                <div className="ds-card__hd">
                  <span className="ds-card__title">
                    <span className="ds-card__title-icon"><CreditCard size={14} aria-hidden="true" /></span> Payment Approvals — Last 6 Months
                  </span>
                </div>
                <div className="ds-card__body">
                  <RevenueChart pays={manualPays} />
                </div>
              </div>

              {/* User growth */}
              <div className="ds-card">
                <div className="ds-card__hd">
                  <span className="ds-card__title">
                    <span className="ds-card__title-icon"><TrendingUp size={14} aria-hidden="true" /></span> User Registrations — Last 7 Months
                  </span>
                </div>
                <div className="ds-card__body">
                  <UserGrowthChart users={users} />
                </div>
              </div>

              {/* Course stats */}
              <div className="ds-card">
                <div className="ds-card__hd">
                  <span className="ds-card__title">
                    <span className="ds-card__title-icon"><BookOpen size={14} aria-hidden="true" /></span> Course Catalogue ({courses.length})
                  </span>
                  <button className="ds-card__link" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-brand)' }} onClick={() => setActiveTab('courses')}>
                    Manage →
                  </button>
                </div>
                <div className="ds-card__body">
                  {courses.length === 0 ? (
                    <div className="ds-empty" style={{ padding: '20px 0' }}>
                      <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1rem' }}>📚</div>
                      <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No courses yet</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {courses.map((c) => (
                        <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{c.icon || '📘'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.855rem', color: 'var(--text-primary)' }}>{c.title}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {c.modules?.reduce((a, m) => a + (m.lessons?.length || 0), 0) || 0} lessons
                            </div>
                          </div>
                          <span className="ds-badge ds-badge--gray">{c.level || 'All'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Recent activity */}
              <div className="ds-card">
                <div className="ds-card__hd">
                  <span className="ds-card__title">
                    <span className="ds-card__title-icon"><Activity size={14} aria-hidden="true" /></span> Recent Activity
                  </span>
                </div>
                <div className="ds-card__body">
                  <ActivityFeed users={users} pays={manualPays} trials={trials} />
                </div>
              </div>

              {/* Quick actions */}
              <div className="ds-card">
                <div className="ds-card__hd">
                  <span className="ds-card__title">
                    <span className="ds-card__title-icon"><BarChart3 size={14} aria-hidden="true" /></span> Quick Actions
                  </span>
                </div>
                <div className="ds-card__body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { Icon: CreditCard, label: `Review Payments (${pendingPayments.length})`, tab: 'payments', badge: pendingPayments.length > 0 },
                      { Icon: Target,     label: `Trial Requests (${trials.length})`, tab: 'trials' },
                      { Icon: Users,      label: 'Manage Users', tab: 'users' },
                      { Icon: BookOpen,   label: 'Manage Courses', tab: 'courses' },
                      { Icon: UserCog,    label: 'Staff Management', tab: 'staff' },
                    ].map((a) => (
                      <button
                        key={a.tab}
                        className="ds-quick-action"
                        onClick={() => setActiveTab(a.tab)}
                        style={{ width: '100%' }}
                      >
                        <span className="ds-quick-action__icon"><a.Icon size={15} aria-hidden="true" /></span>
                        <span className="ds-quick-action__label">{a.label}</span>
                        {a.badge && <span className="ds-badge ds-badge--red" style={{ marginLeft: 'auto', fontSize: '0.62rem' }} aria-label="Needs attention">!</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Teachers list */}
              <div className="ds-card">
                <div className="ds-card__hd">
                  <span className="ds-card__title">
                    <span className="ds-card__title-icon"><UserCog size={14} aria-hidden="true" /></span> Teachers ({teachers.length})
                  </span>
                  <button className="ds-card__link" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-brand)' }} onClick={() => setActiveTab('staff')}>
                    Manage →
                  </button>
                </div>
                <div className="ds-card__body">
                  {teachers.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', padding: '8px 0' }}>No teachers yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {teachers.slice(0, 5).map((t) => (
                        <div key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%', background: 'var(--grad-green)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 700, fontSize: '0.72rem', flexShrink: 0,
                          }}>
                            {getNameInitials(t.name)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{t.name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{t.studentCount || 0} students</div>
                          </div>
                          <span className="ds-badge ds-badge--green">{t.studentCount || 0}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── USERS TAB ──────────────────────────────────────────────── */}
      <div id="tabpanel-users" role="tabpanel" aria-labelledby="tab-users" hidden={activeTab !== 'users'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Users ({usersTotal})
            </h2>
          </div>
          <AdminUsersTab
            users={users}
            usersTotal={usersTotal}
            teachers={teachers}
            onOpenReport={setReportUser}
            onUsersChange={setUsers}
            onError={setError}
          />
        </div>
      </div>

      {/* ── COURSES TAB ────────────────────────────────────────────── */}
      <div id="tabpanel-courses" role="tabpanel" aria-labelledby="tab-courses" hidden={activeTab !== 'courses'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Courses ({courses.length})
            </h2>
          </div>
          <div style={{ padding: 18 }}>
            <AdminCoursesTab courses={courses} onCoursesChange={setCourses} onError={setError} />
          </div>
        </div>
      </div>

      {/* ── PAYMENTS TAB ───────────────────────────────────────────── */}
      <div id="tabpanel-payments" role="tabpanel" aria-labelledby="tab-payments" hidden={activeTab !== 'payments'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Manual Payments
            </h2>
            {pendingPayments.length > 0 && (
              <span className="ds-badge ds-badge--yellow">{pendingPayments.length} pending</span>
            )}
          </div>
          <AdminPaymentsTab
            manualPays={manualPays}
            manualPaysTotal={manualPaysTotal}
            onManualPaysChange={setManualPays}
            onError={setError}
          />
        </div>
      </div>

      {/* ── TRIALS TAB ─────────────────────────────────────────────── */}
      <div id="tabpanel-trials" role="tabpanel" aria-labelledby="tab-trials" hidden={activeTab !== 'trials'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Trial Requests ({trials.length})
            </h2>
          </div>
          <AdminTrialsTab trials={trials} />
        </div>
      </div>

      {/* ── NEWSLETTER TAB ─────────────────────────────────────────── */}
      <div id="tabpanel-newsletter" role="tabpanel" aria-labelledby="tab-newsletter" hidden={activeTab !== 'newsletter'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Newsletter Subscribers ({subscribers.length})
            </h2>
          </div>
          <AdminNewsletterTab subscribers={subscribers} />
        </div>
      </div>

      {/* ── STAFF TAB ──────────────────────────────────────────────── */}
      <div id="tabpanel-staff" role="tabpanel" aria-labelledby="tab-staff" hidden={activeTab !== 'staff'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Staff Management
            </h2>
          </div>
          <div style={{ padding: 18 }}>
            <AdminStaffTab
              teachers={teachers}
              users={users}
              onStaffCreated={loadAll}
              onError={setError}
            />
          </div>
        </div>
      </div>

      {/* ── CLASSES TAB ────────────────────────────────────────────── */}
      <div id="tabpanel-classes" role="tabpanel" aria-labelledby="tab-classes" hidden={activeTab !== 'classes'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <AdminClassesTab users={users} onError={setError} />
        </div>
      </div>

      {/* Progress modal */}
      {reportUser && (
        <AdminProgressModal
          user={reportUser}
          onClose={() => setReportUser(null)}
          onError={setError}
        />
      )}
    </DashboardLayout>
  );
}
