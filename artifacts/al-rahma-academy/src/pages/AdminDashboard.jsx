import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen, CreditCard, Target,
  Mail, Settings,
  RefreshCw, Download, CalendarDays, Star, CalendarCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCourses } from '../api/courseApi';
import { getManualPayments } from '../api/paymentApi';
import { getUsers, getOverviewStats } from '../api/adminApi';
import { getTrials, getSubscribers } from '../api/contentApi';
import { getEnrollments } from '../api/enrollmentApi';
import { getAdminReviews } from '../api/reviewApi';
import AdminCoursesTab    from '../components/features/admin/AdminCoursesTab';
import AdminTrialsTab     from '../components/features/admin/AdminTrialsTab';
import AdminPaymentsTab   from '../components/features/admin/AdminPaymentsTab';
import AdminBookingsTab   from '../components/features/admin/AdminBookingsTab';
import AdminNewsletterTab from '../components/features/admin/AdminNewsletterTab';
import AdminUsersTab      from '../components/features/admin/AdminUsersTab';
import AdminClassesTab   from '../components/features/admin/AdminClassesTab';
import AdminReviewsTab   from '../components/features/admin/AdminReviewsTab';
import AdminProgressModal from '../components/features/admin/AdminProgressModal';
import DashboardLayout    from '../components/layout/DashboardLayout';
import AdminOverviewPanel from '../components/features/admin/AdminOverviewPanel';
import AdminServiceStatus from '../components/features/admin/AdminServiceStatus';

const TABS = [
  { key: 'overview',    label: 'Overview',    Icon: LayoutDashboard },
  { key: 'users',       label: 'Users',       Icon: Users },
  { key: 'courses',     label: 'Courses',     Icon: BookOpen },
  { key: 'bookings',    label: 'Bookings',    Icon: CalendarCheck },
  { key: 'payments',    label: 'Payments',    Icon: CreditCard },
  { key: 'trials',      label: 'Trials',      Icon: Target },
  { key: 'newsletter',  label: 'Newsletter',  Icon: Mail },
  { key: 'classes',     label: 'Classes',     Icon: CalendarDays },
  { key: 'reviews',     label: 'Reviews',     Icon: Star },
];

export default function AdminDashboard() {
  useAuth();
  const queryClient = useQueryClient();

  const [error,      setError]      = useState('');
  const [activeTab,  setActiveTab]  = useState('overview');
  const [reportUser, setReportUser] = useState(null);

  const { data: courses = [], isLoading: l1, isError: e1 }     = useQuery({ queryKey: ['admin', 'courses'],     queryFn: getCourses,                          staleTime: 120000 });
  const { data: trials = [], isLoading: l2, isError: e2 }      = useQuery({ queryKey: ['admin', 'trials'],      queryFn: getTrials,                           staleTime: 60000  });
  const { data: paysRes, isLoading: l3, isError: e3 }          = useQuery({ queryKey: ['admin', 'payments'],    queryFn: getManualPayments,                   staleTime: 30000  });
  const { data: subscribers = [], isLoading: l4, isError: e4 } = useQuery({ queryKey: ['admin', 'newsletter'],  queryFn: getSubscribers,                      staleTime: 300000 });
  const { data: usersRes, isLoading: l5, isError: e5 }         = useQuery({ queryKey: ['admin', 'users'],       queryFn: getUsers,                            staleTime: 60000  });
  const { data: reviewsRes, isLoading: l7, isError: e6 }       = useQuery({ queryKey: ['admin', 'reviews'],     queryFn: getAdminReviews,                     staleTime: 60000  });
  const { data: bookingsRes, isLoading: l10, isError: e9 }         = useQuery({ queryKey: ['admin', 'bookings'],  queryFn: getEnrollments,                      staleTime: 30000  });
  // The Overview tab's figures come from their own count on the server, over
  // every record, not from the lists above (users and bookings hold only the
  // newest 50). The panel shows its own message if this fails.
  const { data: overview, isLoading: l11, isError: e10, error: overviewError } = useQuery({ queryKey: ['admin', 'overview'], queryFn: getOverviewStats, staleTime: 30000 });

  // Surfaces a failed data load (most commonly a 403 for an AdminUser role
  // that lacks the relevant RBAC permission — e.g. 'editor' lacks
  // users:read) as a visible banner instead of the silent "0 users/0
  // payments" an empty-array fallback would otherwise show, which looked
  // indistinguishable from a genuinely empty account.
  const failedSections = [
    e1 && 'courses', e2 && 'trial requests', e3 && 'payments', e4 && 'newsletter subscribers', e5 && 'users', e6 && 'reviews',
    e9 && 'bookings',
  ].filter(Boolean);
  const loadErrorMessage = failedSections.length
    ? `Failed to load: ${failedSections.join(', ')}. You may not have permission to view this data, or there was a network error.`
    : '';

  const manualPays      = paysRes?.data ?? paysRes ?? [];
  const manualPaysTotal = paysRes?.total ?? manualPays.length;
  const users           = usersRes?.data ?? usersRes ?? [];
  const usersTotal      = usersRes?.total ?? users.length;
  const reviews         = reviewsRes?.reviews ?? [];
  const reviewsTotal    = reviewsRes?.total ?? reviews.length;
  const bookings      = bookingsRes?.data ?? bookingsRes ?? [];
  const bookingsTotal = bookingsRes?.total ?? bookings.length;

  const loading = l1 || l2 || l3 || l4 || l5 || l7 || l10;

  const setCourses  = (updater) => queryClient.setQueryData(['admin', 'courses'],    updater);
  const setBookings = (updater) => queryClient.setQueryData(['admin', 'bookings'], (old) => {
    const prev = old?.data ?? old ?? [];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    return old?.data !== undefined ? { ...old, data: next } : next;
  });
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
  const setReviews  = (updater) => queryClient.setQueryData(['admin', 'reviews'],    (old) => {
    const prev = old?.reviews ?? [];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    return old?.reviews !== undefined ? { ...old, reviews: next } : next;
  });
  // A status change in the Trials tab updates the loaded list in place, and
  // refetches the Overview's server-side counts (which count trials by status).
  const setTrials   = (updater) => {
    queryClient.setQueryData(['admin', 'trials'], (old) => (typeof updater === 'function' ? updater(old ?? []) : updater));
    queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
  };

  const loadAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    setError('');
  };

  const pendingPayments   = manualPays.filter((p) => p.status === 'pending');

  /* Tab badge counts. Bookings use the server's count over every booking
     once it has loaded, since the list holds only the newest 50. A trial
     request is new until someone contacts it. */
  const overviewBookings = !e10 ? overview?.sections?.bookings : undefined;
  const tabBadge = (key) => {
    if (key === 'bookings')  return overviewBookings?.status === 'ok' ? overviewBookings.byStatus.pending : bookings.filter((b) => b.status === 'pending').length;
    if (key === 'payments')  return pendingPayments.length;
    if (key === 'trials')    return trials.filter((t) => t.status === 'new').length;
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
            Overview figures are counted on the server over all records; each card says what it counts.
          </p>
        </div>
        <div className="ds-page-hd__actions">
          <button className="btn btn--green btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }} onClick={loadAll}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {loadErrorMessage && (
        <div style={{
          background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
          borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: '0.855rem', color: 'var(--color-danger-text)',
        }}>
          {loadErrorMessage}
        </div>
      )}

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
        <AdminOverviewPanel stats={overview} isLoading={l11} error={e10 ? overviewError : null} onNavigate={setActiveTab} />
        <AdminServiceStatus />
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

      {/* ── BOOKINGS TAB ───────────────────────────────────────────── */}
      <div id="tabpanel-bookings" role="tabpanel" aria-labelledby="tab-bookings" hidden={activeTab !== 'bookings'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Booking Requests
            </h2>
            {bookings.filter((b) => b.status === 'pending').length > 0 && (
              <span className="ds-badge ds-badge--yellow">{bookings.filter((b) => b.status === 'pending').length} new</span>
            )}
          </div>
          <AdminBookingsTab
            bookings={bookings}
            bookingsTotal={bookingsTotal}
            onBookingsChange={setBookings}
            onError={setError}
          />
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
          <AdminTrialsTab trials={trials} onTrialsChange={setTrials} onError={setError} />
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

      {/* ── CLASSES TAB ────────────────────────────────────────────── */}
      <div id="tabpanel-classes" role="tabpanel" aria-labelledby="tab-classes" hidden={activeTab !== 'classes'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <AdminClassesTab users={users} onError={setError} />
        </div>
      </div>

      {/* ── REVIEWS TAB ────────────────────────────────────────────── */}
      <div id="tabpanel-reviews" role="tabpanel" aria-labelledby="tab-reviews" hidden={activeTab !== 'reviews'}>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <AdminReviewsTab
            reviews={reviews}
            reviewsTotal={reviewsTotal}
            onReviewsChange={setReviews}
            onError={setError}
          />
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
