import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Brand from "./Brand";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTheme } from "../../context/ThemeContext";
import LangSwitcher from "../ui/LangSwitcher";
import Avatar from "../ui/Avatar";
import {
  BookOpenIcon, StarIcon, ScrollIcon, MosqueIcon, AlphabetIcon,
  BeadsIcon, LibraryIcon, CompassIcon, CalendarIcon, HandIcon, VerseIcon,
  EditIcon, MessageIcon, AboutIcon, TeacherIcon, LockIcon,
  HomeIcon, CardIcon, SettingsIcon, ShieldIcon, LogoutIcon,
  UsersIcon, MoonIcon, SunIconOutline, ChevronDownIcon, BellIcon,
} from "../ui/Icons";
import { getUnreadCount } from "../../api/messageApi";

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onMouse = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey   = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/* Icon size used consistently throughout the nav */
const ICON_SIZE = 15;

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

  const { data: unreadData } = useQuery({
    queryKey: ["messages", "unread"],
    queryFn: getUnreadCount,
    enabled: Boolean(user),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const closeAll = useCallback(() => {
    setMobileOpen(false);
    [courses, tools, resources, academy, userMenu].forEach((d) => d.setOpen(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");
  const handleLogout = () => { closeAll(); logout(); navigate("/"); };

  const COURSES_ITEMS = [
    { to: "/courses/quran",           label: n.quranTajweed,   Icon: BookOpenIcon },
    { to: "/courses/quran",           label: n.hifzMem,        Icon: StarIcon },
    { to: "/courses/ijazah",          label: n.quranIjazah,    Icon: ScrollIcon },
    { to: "/courses/islamic-studies", label: n.islamicStudies, Icon: MosqueIcon },
    { to: "/courses/arabic",          label: n.arabicAlphabet, Icon: AlphabetIcon },
  ];
  const TOOLS_ITEMS = [
    { to: "/tools/quran-reader",      label: n.quranReader,     Icon: BookOpenIcon },
    { to: "/tools/adhkar",            label: n.adhkar,          Icon: BeadsIcon },
    { to: "/tools/hadith",            label: n.hadith,          Icon: LibraryIcon },
    { to: "/tools/prayer-times",      label: n.prayerTimes,     Icon: MosqueIcon },
    { to: "/tools/qibla",             label: n.qibla,           Icon: CompassIcon },
    { to: "/tools/islamic-calendar",  label: n.islamicCalendar, Icon: CalendarIcon },
    { to: "/tools/verse-of-the-day",  label: n.verseOfDay,      Icon: VerseIcon },
    { to: "/tools/tasbeeh",           label: n.tasbeehCounter,  Icon: HandIcon },
    { to: "/tools/arabic-alphabet",   label: n.arabicAlphabet,  Icon: AlphabetIcon },
  ];
  const RESOURCES_ITEMS = [
    { to: "/resources/blog", label: n.blog, Icon: EditIcon },
    { to: "/resources/faq",  label: n.faq,  Icon: MessageIcon },
  ];
  const ACADEMY_ITEMS = [
    { to: "/academy/about",    label: n.about,    Icon: AboutIcon },
    { to: "/academy/teachers", label: n.teachers, Icon: TeacherIcon },
    { to: "/academy/privacy",  label: n.privacy,  Icon: LockIcon },
  ];

  function NavDropdown({ state, label, items, hubTo }) {
    return (
      <div className={`nav__dropdown${state.open ? " nav__dropdown--expanded" : ""}`} ref={state.ref}>
        <button
          className={`nav__dropdown-trigger${state.open ? " nav__dropdown-trigger--open" : ""}${isActive(hubTo) ? " nav__active" : ""}`}
          onClick={() => state.setOpen((v) => !v)}
          aria-expanded={state.open}
          aria-haspopup="true"
        >
          {label}
          <ChevronDownIcon
            size={11}
            className={`nav__dropdown-chevron${state.open ? " nav__dropdown-chevron--open" : ""}`}
          />
        </button>
        {state.open && (
          <ul className="nav__dropdown-menu nav__dropdown-menu--mega" role="menu">
            {items.map((item) => (
              <li key={item.to + item.label} role="none">
                <Link
                  to={item.to}
                  className={isActive(item.to) ? "nav__dropdown-item nav__dropdown-item--active" : "nav__dropdown-item"}
                  onClick={closeAll}
                  role="menuitem"
                >
                  <span className="nav__dropdown-item-icon" aria-hidden="true">
                    <item.Icon size={ICON_SIZE} />
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="nav__megamenu-footer" role="none">
              <Link to={hubTo} onClick={closeAll} role="menuitem">{n.viewAll} {label} →</Link>
            </li>
          </ul>
        )}
        {/* Mobile: always-visible accordion */}
        <ul className="nav__dropdown-mobile">
          {items.map((item) => (
            <li key={item.to + item.label}>
              <Link to={item.to} className="nav__dropdown-item" onClick={closeAll}>
                <span className="nav__dropdown-item-icon" aria-hidden="true">
                  <item.Icon size={ICON_SIZE} />
                </span>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link to={hubTo} className="nav__dropdown-item" onClick={closeAll} style={{ fontWeight: 700, color: "var(--text-brand-strong)" }}>
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
        <nav className={`nav${mobileOpen ? " open" : ""}`} id="nav" aria-label="Main navigation">
          <NavDropdown state={courses}   label={n.courses}   items={COURSES_ITEMS}   hubTo="/courses" />
          <NavDropdown state={tools}     label={n.tools}     items={TOOLS_ITEMS}     hubTo="/tools" />
          <NavDropdown state={resources} label={n.resources} items={RESOURCES_ITEMS} hubTo="/resources" />
          <NavDropdown state={academy}   label={n.academy}   items={ACADEMY_ITEMS}   hubTo="/academy" />
          <Link to="/enroll" className="nav__cta" onClick={closeAll}>{n.trial}</Link>
        </nav>

        <div className="header__right">
          {/* Notification bell */}
          {user && (
            <Link
              to="/messages"
              className="nav__bell"
              aria-label={unreadCount > 0 ? `${unreadCount} unread messages` : "Messages"}
              onClick={closeAll}
            >
              <BellIcon size={18} />
              {unreadCount > 0 && (
                <span className="nav__bell-badge" aria-hidden="true">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}

          {/* Dark mode toggle */}
          <button
            className="nav__theme-toggle btn btn--icon btn--ghost btn--sm"
            onClick={toggleDark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            title={dark ? "Light mode" : "Dark mode"}
          >
            {dark
              ? <SunIconOutline size={18} />
              : <MoonIcon size={18} />
            }
          </button>

          <LangSwitcher />

          {isParent && (
            <Link to="/parent" className="header__role-btn btn btn--outline btn--sm" onClick={closeAll}>
              <UsersIcon size={15} />
              <span>{n.myChildren}</span>
            </Link>
          )}

          {user ? (
            <div className="nav__dropdown nav__dropdown--user" ref={userMenu.ref}>
              <button
                className={`nav__user-btn${userMenu.open ? " nav__user-btn--open" : ""}`}
                onClick={() => userMenu.setOpen((v) => !v)}
                aria-expanded={userMenu.open}
                aria-haspopup="true"
                aria-label={`Account menu for ${user.name.split(" ")[0]}`}
              >
                <Avatar name={user.name} size="xs" />
                <span className="nav__user-name">{user.name.split(" ")[0]}</span>
                <ChevronDownIcon
                  size={11}
                  className={`nav__dropdown-chevron${userMenu.open ? " nav__dropdown-chevron--open" : ""}`}
                />
              </button>
              {userMenu.open && (
                <ul className="nav__dropdown-menu nav__dropdown-menu--right" role="menu">
                  <li role="none">
                    <Link to="/dashboard" className="nav__dropdown-item" onClick={closeAll} role="menuitem">
                      <span className="nav__dropdown-item-icon" aria-hidden="true"><HomeIcon size={ICON_SIZE} /></span>
                      {n.dashboard}
                    </Link>
                  </li>
                  <li role="none">
                    <Link to="/billing" className="nav__dropdown-item" onClick={closeAll} role="menuitem">
                      <span className="nav__dropdown-item-icon" aria-hidden="true"><CardIcon size={ICON_SIZE} /></span>
                      {n.invoices}
                    </Link>
                  </li>
                  <li role="none">
                    <Link to="/profile" className="nav__dropdown-item" onClick={closeAll} role="menuitem">
                      <span className="nav__dropdown-item-icon" aria-hidden="true"><SettingsIcon size={ICON_SIZE} /></span>
                      {n.profile}
                    </Link>
                  </li>
                  {isTeacher && (
                    <li role="none">
                      <Link to="/teacher" className="nav__dropdown-item" onClick={closeAll} role="menuitem">
                        <span className="nav__dropdown-item-icon" aria-hidden="true"><TeacherIcon size={ICON_SIZE} /></span>
                        {n.teacher}
                      </Link>
                    </li>
                  )}
                  {isParent && (
                    <li role="none">
                      <Link to="/parent" className="nav__dropdown-item" onClick={closeAll} role="menuitem">
                        <span className="nav__dropdown-item-icon" aria-hidden="true"><UsersIcon size={ICON_SIZE} /></span>
                        {n.myChildren}
                      </Link>
                    </li>
                  )}
                  {isAdmin && (
                    <li role="none">
                      <Link to="/admin" className="nav__dropdown-item" onClick={closeAll} role="menuitem">
                        <span className="nav__dropdown-item-icon" aria-hidden="true"><ShieldIcon size={ICON_SIZE} /></span>
                        {n.dashboard}
                      </Link>
                    </li>
                  )}
                  <li className="nav__dropdown-divider" role="separator" />
                  <li role="none">
                    <button className="nav__dropdown-item nav__dropdown-item--danger" onClick={handleLogout} role="menuitem">
                      <span className="nav__dropdown-item-icon" aria-hidden="true"><LogoutIcon size={ICON_SIZE} /></span>
                      {n.logout}
                    </button>
                  </li>
                </ul>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn btn--ghost btn--sm">{n.login}</Link>
          )}

          <button
            className="nav-toggle"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            aria-controls="nav"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className={mobileOpen ? "nav-toggle__x" : ""} />
            <span className={mobileOpen ? "nav-toggle__x nav-toggle__x--mid" : ""} />
            <span className={mobileOpen ? "nav-toggle__x" : ""} />
          </button>
        </div>
      </div>
    </header>
  );
}
