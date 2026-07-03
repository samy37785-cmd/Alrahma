/**
 * Sidebar layout shell.
 *
 * Supports:
 *   - Desktop: fixed left sidebar (240px expanded / 64px collapsed icon-only)
 *   - Tablet (<1024px): overlay drawer (slide-in from left, backdrop)
 *   - Mobile (<640px): same drawer behavior
 *   - Active state per nav item
 *   - Nested nav groups with accordion expand
 *   - Collapse toggle button
 *   - Smooth CSS transitions; respects prefers-reduced-motion
 *
 * Usage in a dashboard page:
 *   <SidebarLayout navItems={ITEMS} user={user} onLogout={logout}>
 *     <PageContent />
 *   </SidebarLayout>
 */

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import {
  ChevronDownIcon, ChevronRightIcon, XIcon, MenuIcon, SidebarIcon,
} from '../ui/Icons';

/* ── SidebarLayout wrapper ── */
export function SidebarLayout({ navItems = [], user, onLogout, brandTo = '/', children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isNarrow = useWindowWidth() < 1024;

  /* Close drawer on route change */
  const location = useLocation();
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  /* Escape key closes drawer */
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  /* Prevent body scroll when drawer is open on mobile */
  useEffect(() => {
    if (isNarrow) {
      document.body.style.overflow = drawerOpen ? 'hidden' : '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isNarrow]);

  return (
    <div className={`sb-layout ${collapsed && !isNarrow ? 'sb-layout--collapsed' : ''}`}>
      {/* ── Desktop sidebar ── */}
      {!isNarrow && (
        <aside
          className={`sb sb--desktop ${collapsed ? 'sb--collapsed' : ''}`}
          aria-label="Main navigation"
        >
          <SidebarInner
            navItems={navItems}
            user={user}
            onLogout={onLogout}
            collapsed={collapsed}
            brandTo={brandTo}
            collapseToggle={() => setCollapsed(v => !v)}
          />
        </aside>
      )}

      {/* ── Mobile/tablet: toggle button in top bar area ── */}
      {isNarrow && (
        <>
          <button
            type="button"
            className="sb-drawer-toggle btn btn--icon btn--ghost"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
          >
            <MenuIcon size={20} />
          </button>

          {/* Backdrop */}
          {drawerOpen && (
            <div
              className="sb-backdrop"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Drawer */}
          <aside
            className={`sb sb--drawer ${drawerOpen ? 'sb--drawer-open' : ''}`}
            aria-label="Main navigation"
            aria-hidden={!drawerOpen}
          >
            <SidebarInner
              navItems={navItems}
              user={user}
              onLogout={onLogout}
              collapsed={false}
              brandTo={brandTo}
              closeDrawer={() => setDrawerOpen(false)}
            />
          </aside>
        </>
      )}

      {/* ── Main content area ── */}
      <main className="sb-content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

/* ── Inner sidebar content ── */
function SidebarInner({ navItems, user, onLogout, collapsed, brandTo, collapseToggle, closeDrawer }) {
  const location = useLocation();

  return (
    <div className="sb__inner">
      {/* Brand / close */}
      <div className="sb__brand">
        {!collapsed && (
          <Link to={brandTo} className="sb__brand-link">
            <span className="sb__brand-icon">☪</span>
            <span className="sb__brand-text">
              <strong>Al-Rahma</strong>
              <small>Academy</small>
            </span>
          </Link>
        )}
        {closeDrawer && (
          <button type="button" className="btn btn--icon btn--ghost sb__close" onClick={closeDrawer} aria-label="Close navigation">
            <XIcon size={18} />
          </button>
        )}
        {collapseToggle && (
          <button
            type="button"
            className="btn btn--icon btn--ghost sb__collapse-btn"
            onClick={collapseToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <SidebarIcon size={18} />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="sb__nav" aria-label="Dashboard navigation">
        <ul className="sb__nav-list" role="list">
          {navItems.map((item) =>
            item.section
              ? !collapsed && (
                  <li key={item.section} className="sb__section-label" role="presentation">
                    {item.section}
                  </li>
                )
              : (
                  <NavItem
                    key={item.to || item.label}
                    item={item}
                    collapsed={collapsed}
                    currentPath={location.pathname}
                  />
                )
          )}
        </ul>
      </nav>

      {/* User block at bottom */}
      <div className="sb__footer">
        {user && (
          <div className="sb__user">
            <Avatar name={user.name} size="sm" />
            {!collapsed && (
              <div className="sb__user-info">
                <span className="sb__user-name">{user.name?.split(' ')[0]}</span>
                <span className="sb__user-role">{user.role}</span>
              </div>
            )}
            <button
              type="button"
              className="btn btn--icon btn--ghost sb__logout"
              onClick={onLogout}
              aria-label="Log out"
              title="Log out"
            >
              <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
                <path d="M13 5l4 5-4 5M17 10H7M3 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Individual nav item (supports nested children) ── */
function NavItem({ item, collapsed, currentPath }) {
  const isActive = currentPath === item.to || currentPath.startsWith(item.to + '/');
  const hasChildren = item.children?.length > 0;
  const anyChildActive = hasChildren && item.children.some(c => currentPath.startsWith(c.to));
  const [open, setOpen] = useState(anyChildActive);

  if (hasChildren) {
    return (
      <li className="sb__item sb__item--group">
        <button
          type="button"
          className={`sb__link sb__link--group ${anyChildActive ? 'sb__link--active' : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
        >
          {item.icon && <span className="sb__icon" aria-hidden="true">{item.icon}</span>}
          {!collapsed && (
            <>
              <span className="sb__label">{item.label}</span>
              <ChevronDownIcon
                size={16}
                className={`sb__chevron ${open ? 'sb__chevron--open' : ''}`}
              />
            </>
          )}
          {item.badge && !collapsed && (
            <span className="sb__badge">{item.badge}</span>
          )}
        </button>
        {!collapsed && open && (
          <ul className="sb__children" role="list">
            {item.children.map(child => (
              <NavItem key={child.to} item={child} collapsed={false} currentPath={currentPath} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li className="sb__item">
      <Link
        to={item.to}
        className={`sb__link ${isActive ? 'sb__link--active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
      >
        {item.icon && <span className="sb__icon" aria-hidden="true">{item.icon}</span>}
        {!collapsed && <span className="sb__label">{item.label}</span>}
        {item.badge && !collapsed && (
          <span className="sb__badge">{item.badge}</span>
        )}
      </Link>
    </li>
  );
}

/* ── Hook: window width ── */
function useWindowWidth() {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

export default SidebarLayout;
