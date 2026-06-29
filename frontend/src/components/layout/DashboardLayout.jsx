import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUnreadCount } from '../../api/messageApi';
import {
  LayoutDashboard, MessageSquare, Users, BookOpen, CreditCard, Target,
  UserCog, Book, User, ExternalLink, Menu, Search, Bell, Sun, Moon,
  GraduationCap, LogOut, Settings, Calendar, ClipboardList, Flame,
  X, ChevronLeft, ChevronRight, BarChart3, Home, Shield, Landmark,
  Mail, FileText, BookMarked,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import CommandPalette from '../ui/CommandPalette';
import NotificationPanel from '../ui/NotificationPanel';
import '../../styles/dashboard-shell.css';

/* Icon renderer — keeps icon size consistent across all nav items */
function NavIcon({ icon: Icon, size = 16 }) {
  return <Icon size={size} aria-hidden="true" />;
}

function navFor(isAdmin, isTeacher, isParent, unreadCount) {
  if (isAdmin) return [
    { section: 'MAIN' },
    { to: '/admin',    icon: LayoutDashboard, label: 'Overview',  end: true },
    { to: '/messages', icon: MessageSquare,   label: 'Messages',  badge: unreadCount || 0 },
    { section: 'MANAGEMENT' },
    { to: '/admin#users',    icon: Users,      label: 'Users' },
    { to: '/admin#courses',  icon: BookOpen,   label: 'Courses' },
    { to: '/admin#payments', icon: CreditCard, label: 'Payments' },
    { to: '/admin#trials',   icon: Target,     label: 'Trials' },
    { to: '/admin#staff',    icon: UserCog,    label: 'Staff' },
    { section: 'SYSTEM' },
    { to: '/', icon: ExternalLink, label: 'View Site', external: true },
  ];

  if (isTeacher) return [
    { section: 'MAIN' },
    { to: '/teacher',  icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/messages', icon: MessageSquare,   label: 'Messages',  badge: unreadCount || 0 },
    { section: 'SCHEDULE' },
    { to: '/calendar',    icon: Calendar,      label: 'Calendar' },
    { to: '/attendance',  icon: ClipboardList, label: 'Attendance' },
    { to: '/homework',    icon: FileText,       label: 'Homework' },
    { section: 'TOOLS' },
    { to: '/tools/quran-reader', icon: Book, label: 'Quran Reader' },
    { section: 'ACCOUNT' },
    { to: '/profile', icon: User,         label: 'Profile' },
    { to: '/',        icon: ExternalLink,  label: 'View Site', external: true },
  ];

  if (isParent) return [
    { section: 'MAIN' },
    { to: '/parent',   icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/messages', icon: MessageSquare,   label: 'Messages',  badge: unreadCount || 0 },
    { section: 'ACCOUNT' },
    { to: '/profile', icon: User,        label: 'Profile' },
    { to: '/',        icon: ExternalLink, label: 'View Site', external: true },
  ];

  return [
    { section: 'MAIN' },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/messages',  icon: MessageSquare,   label: 'Messages',  badge: unreadCount || 0 },
    { section: 'LEARNING' },
    { to: '/tools/quran-reader', icon: Book,        label: 'Quran Reader' },
    { to: '/calendar',           icon: Calendar,     label: 'My Schedule' },
    { to: '/homework',           icon: FileText,      label: 'Homework' },
    { section: 'ACCOUNT' },
    { to: '/profile', icon: User,        label: 'Profile' },
    { to: '/billing', icon: CreditCard,  label: 'Billing' },
    { to: '/',        icon: ExternalLink, label: 'View Site', external: true },
  ];
}

function roleLabel(user, isAdmin, isTeacher, isParent) {
  if (isAdmin)   return 'Administrator';
  if (isTeacher) return 'Teacher';
  if (isParent)  return 'Parent';
  return user?.subscription?.plan ? `${user.subscription.plan} Plan` : 'Student';
}

function bottomNavFor(isAdmin, isTeacher, isParent, unreadCount) {
  if (isAdmin) return [
    { to: '/admin',    icon: LayoutDashboard, label: 'Overview',  end: true },
    { to: '/messages', icon: MessageSquare,   label: 'Messages',  badge: unreadCount },
    { to: '/admin#users', icon: Users,        label: 'Users' },
    { to: '/profile',  icon: User,            label: 'Profile' },
  ];
  if (isTeacher) return [
    { to: '/teacher',  icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/messages', icon: MessageSquare,   label: 'Messages',  badge: unreadCount },
    { to: '/calendar', icon: Calendar,        label: 'Calendar' },
    { to: '/profile',  icon: User,            label: 'Profile' },
  ];
  if (isParent) return [
    { to: '/parent',   icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/messages', icon: MessageSquare,   label: 'Messages',  badge: unreadCount },
    { to: '/profile',  icon: User,            label: 'Profile' },
  ];
  return [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/messages',  icon: MessageSquare,   label: 'Messages',  badge: unreadCount },
    { to: '/tools/quran-reader', icon: Book,   label: 'Quran' },
    { to: '/profile',   icon: User,            label: 'Profile' },
  ];
}

function MobileBottomNav({ isAdmin, isTeacher, isParent, unreadCount }) {
  const location = useLocation();
  const items = bottomNavFor(isAdmin, isTeacher, isParent, unreadCount);

  const isActive = (item) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname.startsWith(item.to.split('#')[0]);
  };

  return (
    <nav className="ds-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={`ds-bottom-nav__item${isActive(item) ? ' ds-bottom-nav__item--active' : ''}`}
          aria-current={isActive(item) ? 'page' : undefined}
          aria-label={item.badge > 0 ? `${item.label} (${item.badge} unread)` : item.label}
        >
          <span className="ds-bottom-nav__icon">
            <item.icon size={22} aria-hidden="true" />
            {item.badge > 0 && (
              <span className="ds-bottom-nav__badge" aria-hidden="true">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </span>
          <span className="ds-bottom-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function DashboardLayout({ children }) {
  const { user, logout, isAdmin, isTeacher, isParent } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [collapsed,  setCollapsed]  = useState(() => {
    try { return localStorage.getItem('ds-collapsed') === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen,    setCmdOpen]    = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [userMenu,   setUserMenu]   = useState(false);

  const userBtnRef  = useRef(null);
  const notifBtnRef = useRef(null);

  // Shared React Query cache with Header — same key means zero extra requests
  const { data: unreadData } = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: getUnreadCount,
    enabled: Boolean(user),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // Memoized so nav items only re-allocate when role or badge changes
  const items = useMemo(
    () => navFor(isAdmin, isTeacher, isParent, unreadCount),
    [isAdmin, isTeacher, isParent, unreadCount]
  );

  useEffect(() => {
    try { localStorage.setItem('ds-collapsed', collapsed ? '1' : '0'); } catch { /* noop */ }
  }, [collapsed]);

  // Close mobile sidebar on every route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Global keyboard shortcut — Ctrl+K / Cmd+K opens command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setNotifOpen(false);
        setUserMenu(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userMenu  && userBtnRef.current  && !userBtnRef.current.contains(e.target))  setUserMenu(false);
      if (notifOpen && notifBtnRef.current && !notifBtnRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenu, notifOpen]);

  const handleLogout = () => {
    setUserMenu(false);
    logout();
    navigate('/');
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const userName = user?.name?.split(' ')[0] ?? 'Account';

  return (
    <div className={`ds${collapsed ? ' ds--collapsed' : ''}${mobileOpen ? ' ds--mobile-open' : ''}`}>
      {/* Mobile overlay */}
      <div className="ds-overlay" onClick={() => setMobileOpen(false)} />

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="ds-sidebar" aria-label="Main navigation">
        {/* Brand */}
        <Link to="/" className="ds-brand">
          <div className="ds-brand__logo">ر</div>
          <div className="ds-brand__text">
            <span className="ds-brand__name">Al-Rahma</span>
            <span className="ds-brand__sub">Academy</span>
          </div>
        </Link>

        {/* Collapse toggle (desktop) */}
        <button
          className="ds-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed
            ? <ChevronRight size={11} aria-hidden="true" />
            : <ChevronLeft  size={11} aria-hidden="true" />
          }
        </button>

        {/* Navigation */}
        <nav className="ds-nav" aria-label="Dashboard navigation">
          {items.map((item, i) => {
            if (item.section !== undefined) {
              return collapsed
                ? <div key={i} style={{ height: 8 }} />
                : <div key={i} className="ds-nav__section">{item.section}</div>;
            }

            if (item.external) {
              return (
                <a
                  key={item.to}
                  href={item.to}
                  className="ds-nav__item"
                  title={item.label}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                >
                  <span className="ds-nav__icon"><NavIcon icon={item.icon} /></span>
                  {!collapsed && <span className="ds-nav__label">{item.label}</span>}
                </a>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `ds-nav__item${isActive ? ' ds-nav__item--active' : ''}`
                }
                title={collapsed ? item.label : undefined}
                aria-label={
                  collapsed
                    ? (item.badge > 0 ? `${item.label} (${item.badge} unread)` : item.label)
                    : undefined
                }
              >
                <span className="ds-nav__icon">
                  <NavIcon icon={item.icon} />
                  {/* Dot indicator keeps badge visible when sidebar is collapsed */}
                  {collapsed && item.badge > 0 && (
                    <span className="ds-nav__icon-dot" aria-hidden="true" />
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span className="ds-nav__label">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="ds-nav__badge" aria-label={`${item.badge} unread`}>
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer: user info + theme toggle */}
        <div className="ds-sidebar__footer">
          {/* Theme toggle */}
          <button
            className="ds-nav__item"
            onClick={toggle}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            <span className="ds-nav__icon">
              {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </span>
            {!collapsed && <span className="ds-nav__label">{dark ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          {/* Settings link */}
          <NavLink
            to="/profile"
            className={({ isActive }) => `ds-nav__item${isActive ? ' ds-nav__item--active' : ''}`}
            title={collapsed ? 'Settings' : undefined}
            aria-label={collapsed ? 'Settings' : undefined}
          >
            <span className="ds-nav__icon"><Settings size={16} aria-hidden="true" /></span>
            {!collapsed && <span className="ds-nav__label">Settings</span>}
          </NavLink>

          {/* User info */}
          <div className="ds-sidebar__user">
            <div className="ds-sidebar__avatar" aria-hidden="true">{initials}</div>
            {!collapsed && (
              <div className="ds-sidebar__user-info">
                <span className="ds-sidebar__user-name">{user?.name}</span>
                <span className="ds-sidebar__user-role">{roleLabel(user, isAdmin, isTeacher, isParent)}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ───────────────────────────────────────────────── */}
      <div className="ds-main">
        {/* Top header */}
        <header className="ds-header">
          {/* Mobile burger */}
          <button
            className="ds-header__burger"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen
              ? <X size={18} aria-hidden="true" />
              : <Menu size={18} aria-hidden="true" />
            }
          </button>

          {/* Search trigger */}
          <button
            className="ds-search-btn"
            onClick={() => setCmdOpen(true)}
            aria-label="Search anything (Ctrl+K)"
            aria-keyshortcuts="Control+k Meta+k"
          >
            <span className="ds-search-btn__icon"><Search size={14} aria-hidden="true" /></span>
            <span className="ds-search-btn__text">Search anything…</span>
            <kbd className="ds-search-btn__kbd">⌘K</kbd>
          </button>

          {/* Right cluster */}
          <div className="ds-header__right">
            {/* Notification bell */}
            <div ref={notifBtnRef} style={{ position: 'relative' }}>
              <button
                className="ds-icon-btn"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                aria-expanded={notifOpen}
                aria-haspopup="dialog"
              >
                <Bell size={17} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="ds-icon-btn__dot" aria-hidden="true" />
                )}
              </button>
              {notifOpen && (
                <NotificationPanel onClose={() => setNotifOpen(false)} />
              )}
            </div>

            {/* User dropdown */}
            <div ref={userBtnRef} style={{ position: 'relative' }}>
              <button
                className="ds-user-btn"
                onClick={() => setUserMenu((o) => !o)}
                aria-label="User menu"
                aria-expanded={userMenu}
                aria-haspopup="menu"
              >
                <div className="ds-user-btn__avatar" aria-hidden="true">{initials}</div>
                <span className="ds-user-btn__name">{userName}</span>
                <ChevronRight
                  size={12}
                  aria-hidden="true"
                  style={{
                    color: 'var(--text-secondary)',
                    transform: userMenu ? 'rotate(90deg)' : 'none',
                    transition: 'transform var(--duration-base)',
                  }}
                />
              </button>

              {userMenu && (
                <div className="ds-dropdown" role="menu" aria-label="User menu">
                  <div className="ds-dropdown__header">
                    <span className="ds-dropdown__name">{user?.name}</span>
                    <span className="ds-dropdown__email">{user?.email}</span>
                  </div>
                  <Link
                    to="/profile"
                    className="ds-dropdown__item"
                    onClick={() => setUserMenu(false)}
                    role="menuitem"
                  >
                    <User size={14} aria-hidden="true" /> Profile
                  </Link>
                  {!isAdmin && !isTeacher && !isParent && (
                    <Link
                      to="/billing"
                      className="ds-dropdown__item"
                      onClick={() => setUserMenu(false)}
                      role="menuitem"
                    >
                      <CreditCard size={14} aria-hidden="true" /> Billing
                    </Link>
                  )}
                  <div className="ds-dropdown__divider" />
                  <button
                    className="ds-dropdown__item ds-dropdown__item--danger"
                    onClick={handleLogout}
                    role="menuitem"
                  >
                    <LogOut size={14} aria-hidden="true" /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="ds-content" id="main-content">
          {children}
        </main>
      </div>

      {/* Command palette */}
      {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}

      {/* Mobile bottom navigation */}
      <MobileBottomNav
        isAdmin={isAdmin}
        isTeacher={isTeacher}
        isParent={isParent}
        unreadCount={unreadCount}
      />
    </div>
  );
}