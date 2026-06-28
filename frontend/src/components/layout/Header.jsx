import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Brand from './Brand';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';
import { useTheme } from '../../context/ThemeContext';
import LangSwitcher from '../ui/LangSwitcher';
import { navLinks } from '../../data';

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return { open, setOpen, ref };
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAdmin, logout } = useAuth();
  const { t } = useLang();
  const { dark, toggle: toggleDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  const tools = useDropdown();
  const userMenu = useDropdown();

  const closeAll = () => {
    setMobileOpen(false);
    tools.setOpen(false);
    userMenu.setOpen(false);
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLogout = () => { closeAll(); logout(); navigate('/'); };

  const TOOLS_ITEMS = [
    { to: '/islamic-tools',  label: t.nav.tools,  icon: '🕌' },
    { to: '/adhkar',         label: t.nav.adhkar, icon: '📿' },
    { to: '/hadith-library', label: t.nav.hadith, icon: '📚' },
    { to: '/quran',          label: 'Quran Reader',icon: '📖' },
  ];

  return (
    <header className="header" id="top">
      <div className="container header__inner">
        <Brand />

        {/* ── Desktop nav ── */}
        <nav className={`nav${mobileOpen ? ' open' : ''}`} id="nav">

          {/* Anchor / page links */}
          {navLinks.map((link) =>
            isHome ? (
              <a key={link.href} href={link.href} onClick={closeAll}>
                {t.nav[link.key] || link.label}
              </a>
            ) : (
              <Link key={link.href} to={`/${link.href}`}
                className={isActive(`/${link.href}`) ? 'nav__active' : undefined}
                onClick={closeAll}>
                {t.nav[link.key] || link.label}
              </Link>
            )
          )}

          {/* Teachers */}
          <Link to="/teachers"
            className={isActive('/teachers') ? 'nav__active' : undefined}
            onClick={closeAll}>
            {t.nav.teachers}
          </Link>

          {/* Tools dropdown */}
          <div className="nav__dropdown" ref={tools.ref}>
            <button
              className={`nav__dropdown-trigger${tools.open ? ' nav__dropdown-trigger--open' : ''}`}
              onClick={() => tools.setOpen((v) => !v)}
              aria-expanded={tools.open}
            >
              Tools
              <svg className="nav__dropdown-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {tools.open && (
              <ul className="nav__dropdown-menu">
                {TOOLS_ITEMS.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to}
                      className={isActive(item.to) ? 'nav__dropdown-item nav__dropdown-item--active' : 'nav__dropdown-item'}
                      onClick={closeAll}>
                      <span>{item.icon}</span> {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Mobile: always visible sub-list */}
            <ul className="nav__dropdown-mobile">
              {TOOLS_ITEMS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="nav__dropdown-item" onClick={closeAll}>
                    <span>{item.icon}</span> {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <Link to="/enroll" className="nav__cta" onClick={closeAll}>
            {t.nav.trial}
          </Link>
        </nav>

        {/* ── Right slot ── */}
        <div className="header__right">
          <button
            className="nav__theme-toggle"
            onClick={toggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? '☀️' : '🌙'}
          </button>
          <LangSwitcher />

          {/* User menu or Login */}
          {user ? (
            <div className="nav__dropdown nav__dropdown--user" ref={userMenu.ref}>
              <button
                className={`nav__user-btn${userMenu.open ? ' nav__user-btn--open' : ''}`}
                onClick={() => userMenu.setOpen((v) => !v)}
                aria-expanded={userMenu.open}
              >
                <span className="nav__user-avatar">{user.name[0].toUpperCase()}</span>
                <span className="nav__user-name">{user.name.split(' ')[0]}</span>
                <svg className="nav__dropdown-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {userMenu.open && (
                <ul className="nav__dropdown-menu nav__dropdown-menu--right">
                  <li>
                    <Link to="/dashboard" className="nav__dropdown-item" onClick={closeAll}>
                      🏠 Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link to="/billing" className="nav__dropdown-item" onClick={closeAll}>
                      💳 {t.nav.invoices}
                    </Link>
                  </li>
                  <li>
                    <Link to="/profile" className="nav__dropdown-item" onClick={closeAll}>
                      ⚙️ Profile
                    </Link>
                  </li>
                  {isAdmin && (
                    <li>
                      <Link to="/admin" className="nav__dropdown-item" onClick={closeAll}>
                        🛡 {t.nav.dashboard}
                      </Link>
                    </li>
                  )}
                  <li className="nav__dropdown-divider" />
                  <li>
                    <button className="nav__dropdown-item nav__dropdown-item--danger" onClick={handleLogout}>
                      ↩ Logout
                    </button>
                  </li>
                </ul>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn btn--ghost btn--sm">{t.nav.login}</Link>
          )}

          {/* Hamburger */}
          <button
            className="nav-toggle"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className={mobileOpen ? 'nav-toggle__x' : ''} />
            <span className={mobileOpen ? 'nav-toggle__x nav-toggle__x--mid' : ''} />
            <span className={mobileOpen ? 'nav-toggle__x' : ''} />
          </button>
        </div>
      </div>
    </header>
  );
}
