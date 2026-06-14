import { useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from './Brand';
import { useAuth } from '../context/AuthContext';
import { navLinks } from '../data';

export default function Header() {
  const [open, setOpen] = useState(false);
  const { user, isAdmin } = useAuth();

  const close = () => setOpen(false);

  return (
    <header className="header" id="top">
      <div className="container header__inner">
        <Brand />

        <nav className={`nav${open ? ' open' : ''}`} id="nav">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={close}>
              {link.label}
            </a>
          ))}
          <Link to="/quran" onClick={close}>Read Quran</Link>
          {isAdmin && (
            <Link to="/admin" onClick={close}>Dashboard</Link>
          )}
          {user && !isAdmin && (
            <Link to="/billing" onClick={close}>My Invoices</Link>
          )}
          {user ? (
            <Link to="/profile" onClick={close}>{user.name.split(' ')[0]}</Link>
          ) : (
            <Link to="/login" onClick={close}>Login</Link>
          )}
          <a href="#trial" className="nav__cta" onClick={close}>
            Free Trial
          </a>
        </nav>

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
    </header>
  );
}
