import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Brand from "./Brand";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTheme } from "../../context/ThemeContext";
import LangSwitcher from "../ui/LangSwitcher";

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return { open, setOpen, ref };
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAdmin, isTeacher, isParent, logout } = useAuth();
  const { t } = useLang();
  const { dark, toggle: toggleDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const n = t.nav;

  const courses   = useDropdown();
  const tools     = useDropdown();
  const resources = useDropdown();
  const academy   = useDropdown();
  const userMenu  = useDropdown();

  const closeAll = () => {
    setMobileOpen(false);
    [courses, tools, resources, academy, userMenu].forEach((d) => d.setOpen(false));
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");
  const handleLogout = () => { closeAll(); logout(); navigate("/"); };

  const COURSES_ITEMS = [
    { to: "/courses/quran",           label: n.quranTajweed,   icon: "📖" },
    { to: "/courses/quran",           label: n.hifzMem,        icon: "🧠" },
    { to: "/courses/ijazah",          label: n.quranIjazah,    icon: "📜" },
    { to: "/courses/islamic-studies", label: n.islamicStudies, icon: "🕌" },
    { to: "/courses/arabic",          label: n.arabicAlphabet, icon: "🔤" },
  ];
  const TOOLS_ITEMS = [
    { to: "/tools/quran-reader",      label: n.quranReader,     icon: "📖" },
    { to: "/tools/adhkar",            label: n.adhkar,          icon: "📿" },
    { to: "/tools/hadith",            label: n.hadith,          icon: "📚" },
    { to: "/tools/prayer-times",      label: n.prayerTimes,     icon: "🕌" },
    { to: "/tools/qibla",             label: n.qibla,           icon: "🧭" },
    { to: "/tools/islamic-calendar",  label: n.islamicCalendar, icon: "📅" },
    { to: "/tools/verse-of-the-day",  label: n.verseOfDay,      icon: "🌟" },
    { to: "/tools/tasbeeh",           label: n.tasbeehCounter,  icon: "✋" },
    { to: "/tools/arabic-alphabet",   label: n.arabicAlphabet,  icon: "🔤" },
  ];
  const RESOURCES_ITEMS = [
    { to: "/resources/blog", label: n.blog, icon: "✍️" },
    { to: "/resources/faq",  label: n.faq,  icon: "❓" },
  ];
  const ACADEMY_ITEMS = [
    { to: "/academy/about",    label: n.about,    icon: "🌿" },
    { to: "/academy/teachers", label: n.teachers, icon: "👨‍🏫" },
    { to: "/academy/privacy",  label: n.privacy,  icon: "🔒" },
  ];

  function NavDropdown({ state, label, items, hubTo }) {
    return (
      <div className="nav__dropdown" ref={state.ref}>
        <button
          className={`nav__dropdown-trigger${state.open ? " nav__dropdown-trigger--open" : ""}${isActive(hubTo) ? " nav__active" : ""}`}
          onClick={() => state.setOpen((v) => !v)}
          aria-expanded={state.open}
        >
          {label}
          <svg className="nav__dropdown-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {state.open && (
          <ul className="nav__dropdown-menu nav__dropdown-menu--mega">
            {items.map((item) => (
              <li key={item.to + item.label}>
                <Link
                  to={item.to}
                  className={isActive(item.to) ? "nav__dropdown-item nav__dropdown-item--active" : "nav__dropdown-item"}
                  onClick={closeAll}
                >
                  <span>{item.icon}</span> {item.label}
                </Link>
              </li>
            ))}
            <li className="nav__megamenu-footer">
              <Link to={hubTo} onClick={closeAll}>{n.viewAll} {label} →</Link>
            </li>
          </ul>
        )}
        <ul className="nav__dropdown-mobile">
          {items.map((item) => (
            <li key={item.to + item.label}>
              <Link to={item.to} className="nav__dropdown-item" onClick={closeAll}>
                <span>{item.icon}</span> {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link to={hubTo} className="nav__dropdown-item" onClick={closeAll} style={{ fontWeight: 700, color: "var(--green-deep)" }}>
              {n.allLabel} {label} →
            </Link>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <header className="header" id="top">
      <div className="container header__inner">
        <Brand />
        <nav className={`nav${mobileOpen ? " open" : ""}`} id="nav">
          <NavDropdown state={courses}   label={n.courses}   items={COURSES_ITEMS}   hubTo="/courses" />
          <NavDropdown state={tools}     label={n.tools}     items={TOOLS_ITEMS}     hubTo="/tools" />
          <NavDropdown state={resources} label={n.resources} items={RESOURCES_ITEMS} hubTo="/resources" />
          <NavDropdown state={academy}   label={n.academy}   items={ACADEMY_ITEMS}   hubTo="/academy" />
          <Link to="/enroll" className="nav__cta" onClick={closeAll}>{n.trial}</Link>
        </nav>

        <div className="header__right">
          <button className="nav__theme-toggle" onClick={toggleDark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? "☀️" : "🌙"}
          </button>
          <LangSwitcher />

          {isParent && (
            <Link to="/parent" className="header__role-btn" onClick={closeAll}>
              👨‍👩‍👧 <span>{n.myChildren}</span>
            </Link>
          )}

          {user ? (
            <div className="nav__dropdown nav__dropdown--user" ref={userMenu.ref}>
              <button className={`nav__user-btn${userMenu.open ? " nav__user-btn--open" : ""}`}
                onClick={() => userMenu.setOpen((v) => !v)} aria-expanded={userMenu.open}>
                <span className="nav__user-avatar">{user.name[0].toUpperCase()}</span>
                <span className="nav__user-name">{user.name.split(" ")[0]}</span>
                <svg className="nav__dropdown-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {userMenu.open && (
                <ul className="nav__dropdown-menu nav__dropdown-menu--right">
                  <li><Link to="/dashboard" className="nav__dropdown-item" onClick={closeAll}>🏠 {n.dashboard}</Link></li>
                  <li><Link to="/billing"   className="nav__dropdown-item" onClick={closeAll}>💳 {n.invoices}</Link></li>
                  <li><Link to="/profile"   className="nav__dropdown-item" onClick={closeAll}>⚙️ {n.profile}</Link></li>
                  {isTeacher && <li><Link to="/teacher" className="nav__dropdown-item" onClick={closeAll}>👨‍🏫 {n.teacher}</Link></li>}
                  {isParent  && <li><Link to="/parent"  className="nav__dropdown-item" onClick={closeAll}>👨‍👩‍👧 {n.myChildren}</Link></li>}
                  {isAdmin   && <li><Link to="/admin"   className="nav__dropdown-item" onClick={closeAll}>🛡 {n.dashboard}</Link></li>}
                  <li className="nav__dropdown-divider" />
                  <li><button className="nav__dropdown-item nav__dropdown-item--danger" onClick={handleLogout}>↩ {n.logout}</button></li>
                </ul>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn btn--ghost btn--sm">{n.login}</Link>
          )}

          <button className="nav-toggle" aria-label={n.courses} aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}>
            <span className={mobileOpen ? "nav-toggle__x" : ""} />
            <span className={mobileOpen ? "nav-toggle__x nav-toggle__x--mid" : ""} />
            <span className={mobileOpen ? "nav-toggle__x" : ""} />
          </button>
        </div>
      </div>
    </header>
  );
}
