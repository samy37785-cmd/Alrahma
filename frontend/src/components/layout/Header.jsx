import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BrandLockup from "../ui/BrandLockup";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTheme } from "../../context/ThemeContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import LangSwitcher from "../ui/LangSwitcher";
import Avatar from "../ui/Avatar";
import CommandPalette from "../ui/CommandPalette";
import { LANGS } from "../../i18n";
import {
  BookOpenIcon, StarIcon, ScrollIcon, MosqueIcon, AlphabetIcon,
  BeadsIcon, LibraryIcon, CompassIcon, CalendarIcon, HandIcon, VerseIcon,
  EditIcon, MessageIcon, AboutIcon, TeacherIcon, LockIcon,
  HomeIcon, CardIcon, SettingsIcon, ShieldIcon, LogoutIcon,
  UsersIcon, MoonIcon, SunIconOutline, ChevronDownIcon, BellIcon, SearchIcon,
} from "../ui/Icons";
import { getUnreadCount } from "../../api/messageApi";

const FLAG = { en: "🇬🇧", ar: "🇪🇬", it: "🇮🇹", es: "🇪🇸", de: "🇩🇪", fr: "🇫🇷" };

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

function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const focusable = el.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    first?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus(); }
      }
    };
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, [active, ref]);
}

const ICON_SIZE = 15;

// Module-level — never remounts on Header re-renders; receives closures as explicit props
function NavDropdown({ state, label, items, hubTo, wide, isActive, closeAll, viewAllLabel, allLabel }) {
  return (
    <div className={`nav__dropdown${state.open ? " nav__dropdown--expanded" : ""}`} ref={state.ref}>
      <button
        className={`nav__dropdown-trigger${state.open ? " nav__dropdown-trigger--open" : ""}${isActive(hubTo) ? " nav__active" : ""}`}
        onClick={() => state.setOpen((v) => !v)}
        aria-expanded={state.open}
        aria-haspopup="menu"
      >
        {label}
        <ChevronDownIcon
          size={11}
          className={`nav__dropdown-chevron${state.open ? " nav__dropdown-chevron--open" : ""}`}
        />
      </button>

      {/* Desktop mega-menu */}
      {state.open && (
        <ul
          className={`nav__dropdown-menu nav__dropdown-menu--mega${wide ? " nav__dropdown-menu--wide" : ""}`}
          role="menu"
        >
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
            <Link to={hubTo} onClick={closeAll} role="menuitem">{viewAllLabel} {label} →</Link>
          </li>
        </ul>
      )}

      {/* Mobile accordion — aria-hidden keeps screen readers on the desktop version only */}
      <ul className="nav__dropdown-mobile" aria-hidden="true">
        {items.map((item) => (
          <li key={item.to + item.label}>
            <Link to={item.to} className="nav__dropdown-item" onClick={closeAll} tabIndex={-1}>
              <span className="nav__dropdown-item-icon" aria-hidden="true">
                <item.Icon size={ICON_SIZE} />
              </span>
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <Link to={hubTo} className="nav__dropdown-item" onClick={closeAll} tabIndex={-1}
            style={{ fontWeight: 700, color: "var(--text-brand-strong)" }}>
            {allLabel} {label} →
          </Link>
        </li>
      </ul>
    </div>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen]       = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const { user, isAdmin, isTeacher, isParent, logout } = useAuth();
  const { t, lang, setLang } = useLang();
  const { dark, toggle: toggleDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const n = t.nav;

  const navRef      = useRef(null);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);

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

  /* Focus trap inside the open mobile drawer */
  useFocusTrap(navRef, mobileOpen);

  /* Close mobile drawer on route change */
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  /* Prevent body scroll while drawer is open */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  /* Close desktop dropdowns when page is scrolled */
  useEffect(() => {
    const close = () => [courses, tools, resources, academy, userMenu].forEach(d => d.setOpen(false));
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Shrink the header slightly once the page has scrolled past the hero —
     a small threshold (not 0) avoids flicker from momentum-scroll bounce
     at the very top on iOS/macOS trackpads. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Escape closes the mobile drawer */
  useEscapeKey(() => setMobileOpen(false), mobileOpen);

  /* Ctrl+K / ⌘+K opens the command palette */
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const closeAll = useCallback(() => {
    setMobileOpen(false);
    [courses, tools, resources, academy, userMenu].forEach((d) => d.setOpen(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");
  const handleLogout = () => { closeAll(); logout(); navigate("/"); };

  /* Same as Brand.jsx: on any inner page → navigate home; already on
     home → just scroll to top. */
  const handleBrandClick = () => {
    if (location.pathname === "/") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Swipe-up gesture closes the mobile drawer */
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current);
    if (dy < -70 && Math.abs(dy) > dx * 1.5) setMobileOpen(false);
  }, []);

  const COURSES_ITEMS = useMemo(() => [
    { to: "/courses/quran",           label: n.quranTajweed,   Icon: BookOpenIcon },
    { to: "/courses/quran#hifz",      label: n.hifzMem,        Icon: StarIcon },
    { to: "/courses/ijazah",          label: n.quranIjazah,    Icon: ScrollIcon },
    { to: "/courses/islamic-studies", label: n.islamicStudies, Icon: MosqueIcon },
    { to: "/courses/arabic",          label: n.arabicAlphabet, Icon: AlphabetIcon },
  ], [n]);
  const TOOLS_ITEMS = useMemo(() => [
    { to: "/tools/quran-reader",      label: n.quranReader,     Icon: BookOpenIcon },
    { to: "/tools/adhkar",            label: n.adhkar,          Icon: BeadsIcon },
    { to: "/tools/hadith",            label: n.hadith,          Icon: LibraryIcon },
    { to: "/tools/prayer-times",      label: n.prayerTimes,     Icon: MosqueIcon },
    { to: "/tools/qibla",             label: n.qibla,           Icon: CompassIcon },
    { to: "/tools/islamic-calendar",  label: n.islamicCalendar, Icon: CalendarIcon },
    { to: "/tools/verse-of-the-day",  label: n.verseOfDay,      Icon: VerseIcon },
    { to: "/tools/tasbeeh",           label: n.tasbeehCounter,  Icon: HandIcon },
    { to: "/tools/arabic-alphabet",   label: n.arabicAlphabet,  Icon: AlphabetIcon },
  ], [n]);
  const RESOURCES_ITEMS = useMemo(() => [
    { to: "/resources/blog", label: n.blog, Icon: EditIcon },
    { to: "/resources/faq",  label: n.faq,  Icon: MessageIcon },
  ], [n]);
  const ACADEMY_ITEMS = useMemo(() => [
    { to: "/academy/about",    label: n.about,    Icon: AboutIcon },
    { to: "/academy/teachers", label: n.teachers, Icon: TeacherIcon },
    { to: "/academy/privacy",  label: n.privacy,  Icon: LockIcon },
  ], [n]);

  const userName = user?.name?.split(" ")[0] ?? "Account";

  return (
    <>
      <header className={`header${scrolled ? " header--scrolled" : ""}`} id="top">
        <div className="container header__inner">
          <Link to="/" onClick={handleBrandClick} className="header__brand-link" aria-label="Al-Rahma Academy home">
            <BrandLockup orientation="horizontal" plain showBismillah={false} size={40} className="header__lockup" />
          </Link>

          <nav
            className={`nav${mobileOpen ? " open" : ""}`}
            id="nav"
            aria-label="Main navigation"
            ref={navRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >

            {/* ── Mobile-only: signed-in user profile strip + account links ── */}
            {user && (
              <>
                <div className="nav__mobile-profile">
                  <Avatar name={user.name} size="sm" />
                  <div className="nav__mobile-profile-info">
                    <span className="nav__mobile-profile-name">{user.name}</span>
                    <span className="nav__mobile-profile-role">{user.role}</span>
                  </div>
                  <Link
                    to="/profile"
                    className="nav__mobile-profile-edit"
                    onClick={closeAll}
                    aria-label="Edit profile"
                  >
                    <SettingsIcon size={16} />
                  </Link>
                </div>
                <div className="nav__mobile-account">
                  <span className="nav__mobile-account-label">My Account</span>
                  <Link
                    to={isAdmin ? '/admin' : isTeacher ? '/teacher' : isParent ? '/parent' : '/dashboard'}
                    className="nav__mobile-account-link"
                    onClick={closeAll}
                  >
                    <span className="nav__mobile-account-icon">
                      {isAdmin ? <ShieldIcon size={ICON_SIZE} /> : isTeacher ? <TeacherIcon size={ICON_SIZE} /> : isParent ? <UsersIcon size={ICON_SIZE} /> : <HomeIcon size={ICON_SIZE} />}
                    </span>
                    <span>{n.dashboard}</span>
                  </Link>
                  <Link to="/billing" className="nav__mobile-account-link" onClick={closeAll}>
                    <span className="nav__mobile-account-icon"><CardIcon size={ICON_SIZE} /></span>
                    <span>{n.invoices}</span>
                  </Link>
                </div>
              </>
            )}

            {/* ── Main nav items ── */}
            <NavDropdown state={courses}   label={n.courses}   items={COURSES_ITEMS}   hubTo="/courses"   isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} />
            <NavDropdown state={tools}     label={n.tools}     items={TOOLS_ITEMS}     hubTo="/tools"     isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} wide />
            <NavDropdown state={resources} label={n.resources} items={RESOURCES_ITEMS} hubTo="/resources" isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} />
            <NavDropdown state={academy}   label={n.academy}   items={ACADEMY_ITEMS}   hubTo="/academy"   isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} />
            <Link to="/enroll" className="nav__cta" onClick={closeAll}>{n.trial}</Link>

            {/* ── Mobile-only: search / command palette trigger ── */}
            <button
              className="nav__mobile-search"
              onClick={() => { setCmdOpen(true); setMobileOpen(false); }}
              aria-label="Search pages and tools"
            >
              <span className="nav__mobile-search-icon"><SearchIcon size={16} /></span>
              <span>Search pages, tools…</span>
              <kbd>Ctrl K</kbd>
            </button>

            {/* ── Mobile-only: theme toggle + language picker ── */}
            <div className="nav__mobile-settings">
              <button
                className="nav__mobile-theme-btn"
                onClick={toggleDark}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              >
                <span className="nav__mobile-theme-icon">
                  {dark ? <SunIconOutline size={18} /> : <MoonIcon size={18} />}
                </span>
                <span className="nav__mobile-theme-label">
                  {dark ? "Light Mode" : "Dark Mode"}
                </span>
                <span
                  className={`nav__mobile-toggle${dark ? " nav__mobile-toggle--on" : ""}`}
                  aria-hidden="true"
                />
              </button>

              <div className="nav__mobile-langs" role="group" aria-label="Select language">
                {LANGS.map((code) => (
                  <button
                    key={code}
                    className={`nav__mobile-lang-btn${lang === code ? " nav__mobile-lang-btn--active" : ""}`}
                    onClick={() => setLang(code)}
                    aria-pressed={lang === code}
                  >
                    {FLAG[code]} {code.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Mobile-only: logout / login at bottom of drawer ── */}
            {user ? (
              <button className="nav__mobile-logout" onClick={handleLogout}>
                <LogoutIcon size={ICON_SIZE} /> {n.logout}
              </button>
            ) : (
              <Link to="/login" className="nav__mobile-login-link" onClick={closeAll}>
                {n.login}
              </Link>
            )}
          </nav>

          {/* ── Right cluster: always visible in the header bar ── */}
          <div className="header__right">

            {/* Bell — visible in header on all screen sizes when logged in */}
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

            {/* Dark mode toggle — desktop only; mobile uses drawer version */}
            <button
              className="nav__theme-toggle btn btn--icon btn--ghost-inv btn--sm"
              onClick={toggleDark}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark ? <SunIconOutline size={18} /> : <MoonIcon size={18} />}
            </button>

            {/* Language switcher — desktop only; mobile uses drawer version */}
            <LangSwitcher />

            {/* Parent quick-link — desktop only */}
            {isParent && (
              <Link to="/parent" className="header__role-btn btn btn--outline btn--sm" onClick={closeAll}>
                <UsersIcon size={15} />
                <span>{n.myChildren}</span>
              </Link>
            )}

            {/* User dropdown — desktop only; mobile has full drawer section */}
            {user ? (
              <div className="nav__dropdown nav__dropdown--user header__user-desktop" ref={userMenu.ref}>
                <button
                  className={`nav__user-btn${userMenu.open ? " nav__user-btn--open" : ""}`}
                  onClick={() => userMenu.setOpen((v) => !v)}
                  aria-expanded={userMenu.open}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${userName}`}
                >
                  <Avatar name={user.name} size="xs" />
                  <span className="nav__user-name">{userName}</span>
                  <ChevronDownIcon
                    size={11}
                    className={`nav__dropdown-chevron${userMenu.open ? " nav__dropdown-chevron--open" : ""}`}
                  />
                </button>
                {userMenu.open && (
                  <ul className="nav__dropdown-menu nav__dropdown-menu--right" role="menu">
                    <li role="none">
                      <Link
                        to={isAdmin ? '/admin' : isTeacher ? '/teacher' : isParent ? '/parent' : '/dashboard'}
                        className="nav__dropdown-item"
                        onClick={closeAll}
                        role="menuitem"
                      >
                        <span className="nav__dropdown-item-icon" aria-hidden="true">
                          {isAdmin ? <ShieldIcon size={ICON_SIZE} /> : isTeacher ? <TeacherIcon size={ICON_SIZE} /> : isParent ? <UsersIcon size={ICON_SIZE} /> : <HomeIcon size={ICON_SIZE} />}
                        </span>
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
              <Link to="/login" className="btn btn--ghost-inv btn--sm">{n.login}</Link>
            )}

            {/* Search / Command Palette — desktop only; mobile has its own in the drawer */}
            <button
              className="nav__search-btn btn btn--icon btn--ghost-inv btn--sm"
              onClick={() => setCmdOpen(true)}
              aria-label="Search (Ctrl+K)"
              title="Search (Ctrl+K)"
            >
              <SearchIcon size={18} />
            </button>

            {/* Hamburger — shown only on mobile */}
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

      {/* Backdrop portal — renders at body level so z-index stacking is unambiguous */}
      {mobileOpen && createPortal(
        <div
          className="nav-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />,
        document.body
      )}

      {/* Command Palette */}
      {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}
    </>
  );
}
