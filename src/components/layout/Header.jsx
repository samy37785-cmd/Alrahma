import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Brand from './Brand';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';
import LangSwitcher from '../ui/LangSwitcher';
import { navLinks } from '../../data';

export default function Header() {
  const [open, setOpen] = useState(false);
  const { user, isAdmin } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const close = () => setOpen(false);

  return (
    <header className="header" id="top">
      <div className="container header__inner">
        <Brand />

        <nav className={`nav${open ? ' open' : ''}`} id="nav">
          {navLinks.map((link) =>
            isHome ? (
              <a key={link.href} href={link.href} onClick={close}>
                {t.nav[link.key] || link.label}
              </a>
            ) : (
              <Link key={link.href} to={`/${link.href}`} onClick={close}>
                {t.nav[link.key] || link.label}
              </Link>
            )
          )}
          <Link to="/teachers" onClick={close}>{t.nav.teachers}</Link>
          <Link to="/islamic-tools" onClick={close}>{t.nav.tools}</Link>
          <Link to="/adhkar" onClick={close}>{t.nav.adhkar}</Link>
          <Link to="/hadith-library" onClick={close}>{t.nav.hadith}</Link>
          {isAdmin && (
            <Link to="/admin" onClick={close}>{t.nav.dashboard}</Link>
          )}
          {user && !isAdmin && (
            <Link to="/billing" onClick={close}>{t.nav.invoices}</Link>
          )}
          {user ? (
            <Link to="/profile" onClick={close}>{user.name.split(' ')[0]}</Link>
          ) : (
            <Link to="/login" onClick={close}>{t.nav.login}</Link>
          )}
          <Link to="/enroll" className="nav__cta" onClick={close}>
            {t.nav.trial}
          </Link>
        </nav>

        <div className="header__right">
          <LangSwitcher />
          <button
            className="nav-toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
    </header>
  );
}
