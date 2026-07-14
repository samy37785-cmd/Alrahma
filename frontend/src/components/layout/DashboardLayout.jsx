import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUnreadCount } from '../../api/messageApi';
import { getUnreadNotifs } from '../../api/notificationApi';
import {
  LayoutDashboard, MessageSquare, Users, BookOpen, CreditCard, Target,
  UserCog, Book, User, ExternalLink, Menu, Search, Bell, Sun, Moon,
  GraduationCap, LogOut, Calendar, ClipboardList, Flame,
  X, ChevronLeft, ChevronRight, BarChart3, Home, Shield, Landmark,
  Mail, FileText, BookMarked, Heart, Sparkles, Users2, MessageCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import CommandPalette from '../ui/CommandPalette';
import NotificationPanel from '../ui/NotificationPanel';
import LangSwitcher from '../ui/LangSwitcher';
import { getNameInitials } from '../../utils/nameInitials';
import BrandIcon from '../ui/BrandIcon';
import '../../styles/dashboard-shell.css';
// LangSwitcher's `.ls*` styles live in header.css (shared with the public
// Header). Importing it here too pulls in some unrelated `.header`/`.nav__*`
// rules that go unused on dashboard pages, but that's a safe no-op (no class
// name collisions with dashboard-shell.css) — simplest way to reuse the
// component without duplicating its CSS into a second file.
import '../../styles/layout/header.css';
import { navFor, roleLabel } from './dashboardNav';
import NavIcon from './NavIcon';
import MobileBottomNav from './MobileBottomNav';

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
  const sidebarRef  = useRef(null);
  const burgerRef   = useRef(null);

  // Shared React Query cache with Header — same key means zero extra requests
  const { data: unreadData } = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: getUnreadCount,
    enabled: Boolean(user),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // Separate from the messages unread count above — this drives the bell's
  // own badge, not the "Messages" nav item's.
  const { data: notifUnreadData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadNotifs,
    enabled: Boolean(user),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const notifUnreadCount = notifUnreadData?.count ?? 0;

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

  // Mobile drawer: focus management + focus trap
  useEffect(() => {
    if (!mobileOpen) {
      burgerRef.current?.focus();
      return;
    }
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const focusable = sidebar.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();

    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const els = [...sidebar.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [mobileOpen]);

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

  const initials = user?.name ? getNameInitials(user.name) : '?';

  const userName = user?.name?.split(' ')[0] ?? 'Account';

  return (
    <div className={`ds${collapsed ? ' ds--collapsed' : ''}${mobileOpen ? ' ds--mobile-open' : ''}`}>
      {/* Mobile overlay */}
      <button
        type="button"
        className="ds-overlay"
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
      />

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside
        ref={sidebarRef}
        className="ds-sidebar"
        aria-label="Main navigation"
        aria-modal={mobileOpen ? 'true' : undefined}
      >
        {/* Brand */}
        <Link to="/" className="ds-brand">
          <BrandIcon size={34} className="ds-brand__logo" />
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

        {/* Footer: user info. Account actions (Profile/Billing/Log out) live
            in one place only — the header user-menu dropdown below — instead
            of being split across a second "Settings" link here that pointed
            at the exact same /profile route under a different label. */}
        <div className="ds-sidebar__footer">
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
      <div className="ds-main" aria-hidden={mobileOpen ? 'true' : undefined}>
        {/* Top header */}
        <header className="ds-header">
          {/* Mobile burger */}
          <button
            ref={burgerRef}
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
            {/* Language switcher */}
            <LangSwitcher />

            {/* Theme toggle — moved here from the sidebar footer so search,
                language, theme, notifications, and the user menu all live in
                one consistent top-bar cluster. */}
            <button
              className="ds-icon-btn"
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>

            {/* Notification bell */}
            <div ref={notifBtnRef} style={{ position: 'relative' }}>
              <button
                className="ds-icon-btn"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label={`Notifications${notifUnreadCount > 0 ? ` (${notifUnreadCount} unread)` : ''}`}
                aria-expanded={notifOpen}
                aria-haspopup="dialog"
              >
                <Bell size={17} aria-hidden="true" />
                {notifUnreadCount > 0 && (
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