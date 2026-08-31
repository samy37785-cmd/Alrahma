import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BrandLockup from "../ui/BrandLockup";
import { useAuth } from "../../context/AuthContext";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useLang, withLanguage } from "../../context/LangContext";
import { homeHref } from "../../utils/localePath";
import { useTheme } from "../../context/ThemeContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import LangSwitcher from "../ui/LangSwitcher";
import Avatar from "../ui/Avatar";
import CommandPalette from "../ui/CommandPalette";
import { LANGS } from "../../i18n";
import { getExperienceText } from "../../i18n/experience";
import {
  BookOpenIcon, StarIcon, ScrollIcon, MosqueIcon, AlphabetIcon,
  BeadsIcon, LibraryIcon, CompassIcon, CalendarIcon, HandIcon, VerseIcon,
  EditIcon, MessageIcon, AboutIcon, TeacherIcon, LockIcon,
  HomeIcon, CardIcon, SettingsIcon, ShieldIcon, LogoutIcon,
  MoonIcon, SunIconOutline, ChevronDownIcon, BellIcon, SearchIcon,
} from "../ui/Icons";
import { getUnreadCount } from "../../api/messageApi";
import { NavDropdown, ICON_SIZE } from "./NavDropdown";
import { useDropdown } from "../../hooks/useDropdown";
import { useFocusTrap } from "../../hooks/useFocusTrap";

const FLAG = { en: "🇬🇧", ar: "🇪🇬", it: "🇮🇹", es: "🇪🇸", de: "🇩🇪", fr: "🇫🇷" };

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen]       = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const { user, logout } = useAuth();
  // isAdmin is proven exclusively by the real AdminUser + MFA session, never
  // by the regular account's own `role` field. See src/utils/accountRoles.js.
  // There is no isTeacher/isParent any more - both normalize to `user`.
  const { isAdmin } = useAdminAuth();
  const { t, lang, setLang } = useLang();
  const copy = getExperienceText(lang).header;
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

  const localizedTo = useCallback((to) => withLanguage(to, lang), [lang]);
  const isActive = (path) => {
    const pathname = path.split(/[?#]/, 1)[0];
    return location.pathname === pathname || location.pathname.startsWith(pathname + "/");
  };
  const handleLogout = () => { closeAll(); logout(); navigate(localizedTo("/")); };

  /* Raw <a href={homeHref()}>, not <Link> — see utils/localePath.js's
     homeHref() comment: react-router can't render a duplicate-free,
     trailing-slash-correct "/fr/" via <Link> under a non-English basename.
     On any inner page → let the real navigation happen; already on
     home → prevent the (unnecessary) reload and just scroll to top. */
  const handleBrandClick = (e) => {
    if (location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
    { to: localizedTo("/courses/quran"),           label: n.quranTajweed,   Icon: BookOpenIcon },
    { to: localizedTo("/courses/quran#hifz"),      label: n.hifzMem,        Icon: StarIcon },
    { to: localizedTo("/courses/ijazah"),          label: n.quranIjazah,    Icon: ScrollIcon },
    { to: localizedTo("/courses/islamic-studies"), label: n.islamicStudies, Icon: MosqueIcon },
    { to: localizedTo("/courses/arabic"),          label: n.arabicAlphabet, Icon: AlphabetIcon },
  ], [localizedTo, n]);
  const TOOLS_ITEMS = useMemo(() => [
    { to: localizedTo("/tools/quran-reader"),      label: n.quranReader,     Icon: BookOpenIcon },
    { to: localizedTo("/tools/adhkar"),            label: n.adhkar,          Icon: BeadsIcon },
    { to: localizedTo("/tools/hadith"),            label: n.hadith,          Icon: LibraryIcon },
    { to: localizedTo("/tools/prayer-times"),      label: n.prayerTimes,     Icon: MosqueIcon },
    { to: localizedTo("/tools/qibla"),             label: n.qibla,           Icon: CompassIcon },
    { to: localizedTo("/tools/islamic-calendar"),  label: n.islamicCalendar, Icon: CalendarIcon },
    { to: localizedTo("/tools/verse-of-the-day"),  label: n.verseOfDay,      Icon: VerseIcon },
    { to: localizedTo("/tools/tasbeeh"),           label: n.tasbeehCounter,  Icon: HandIcon },
    { to: localizedTo("/tools/arabic-alphabet"),   label: n.arabicAlphabet,  Icon: AlphabetIcon },
  ], [localizedTo, n]);
  const RESOURCES_ITEMS = useMemo(() => [
    { to: localizedTo("/resources/blog"), label: n.blog, Icon: EditIcon },
    { to: localizedTo("/resources/faq"),  label: n.faq,  Icon: MessageIcon },
  ], [localizedTo, n]);
  const ACADEMY_ITEMS = useMemo(() => [
    { to: localizedTo("/academy/about"),    label: n.about,    Icon: AboutIcon },
    { to: localizedTo("/academy/teachers"), label: n.teachers, Icon: TeacherIcon },
    { to: localizedTo("/academy/privacy"),  label: n.privacy,  Icon: LockIcon },
  ], [localizedTo, n]);

  const userName = user?.name?.split(" ")[0] ?? copy.account;

  return (
    <>
      <header className={`header${scrolled ? " header--scrolled" : ""}`} id="top">
        <div className="container header__inner">
          <a href={homeHref()} onClick={handleBrandClick} className="header__brand-link" aria-label={copy.home}>
            <BrandLockup orientation="horizontal" plain showBismillah={false} size={40} className="header__lockup" />
          </a>

          <nav
            className={`nav${mobileOpen ? " open" : ""}`}
            id="nav"
            aria-label={copy.openNavigation}
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
                    to={localizedTo("/profile")}
                    className="nav__mobile-profile-edit"
                    onClick={closeAll}
                    aria-label={copy.editProfile}
                  >
                    <SettingsIcon size={16} />
                  </Link>
                </div>
                <div className="nav__mobile-account">
                  <span className="nav__mobile-account-label">{copy.myAccount}</span>
                  <Link
                    to={localizedTo(isAdmin ? '/admin' : '/dashboard')}
                    className="nav__mobile-account-link"
                    onClick={closeAll}
                  >
                    <span className="nav__mobile-account-icon">
                      {isAdmin ? <ShieldIcon size={ICON_SIZE} /> : <HomeIcon size={ICON_SIZE} />}
                    </span>
                    <span>{n.dashboard}</span>
                  </Link>
                  <Link to={localizedTo("/billing")} className="nav__mobile-account-link" onClick={closeAll}>
                    <span className="nav__mobile-account-icon"><CardIcon size={ICON_SIZE} /></span>
                    <span>{n.invoices}</span>
                  </Link>
                </div>
              </>
            )}

            {/* ── Main nav items ── */}
            <NavDropdown state={courses}   label={n.courses}   items={COURSES_ITEMS}   hubTo={localizedTo("/courses")}   isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} />
            <NavDropdown state={tools}     label={n.tools}     items={TOOLS_ITEMS}     hubTo={localizedTo("/tools")}     isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} wide />
            <NavDropdown state={resources} label={n.resources} items={RESOURCES_ITEMS} hubTo={localizedTo("/resources")} isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} />
            <NavDropdown state={academy}   label={n.academy}   items={ACADEMY_ITEMS}   hubTo={localizedTo("/academy")}   isActive={isActive} closeAll={closeAll} viewAllLabel={n.viewAll} allLabel={n.allLabel} />
            <Link to={localizedTo("/enroll")} className="nav__cta" onClick={closeAll}>{n.trial}</Link>

            {/* ── Mobile-only: search / command palette trigger ── */}
            <button
              className="nav__mobile-search"
              onClick={() => { setCmdOpen(true); setMobileOpen(false); }}
              aria-label={copy.searchPages}
            >
              <span className="nav__mobile-search-icon"><SearchIcon size={16} /></span>
              <span>{copy.searchPrompt}</span>
              <kbd>Ctrl K</kbd>
            </button>

            {/* ── Mobile-only: theme toggle + language picker ── */}
            <div className="nav__mobile-settings">
              <button
                className="nav__mobile-theme-btn"
                onClick={toggleDark}
                aria-label={dark ? copy.lightMode : copy.darkMode}
              >
                <span className="nav__mobile-theme-icon">
                  {dark ? <SunIconOutline size={18} /> : <MoonIcon size={18} />}
                </span>
                <span className="nav__mobile-theme-label">
                  {dark ? copy.lightMode : copy.darkMode}
                </span>
                <span
                  className={`nav__mobile-toggle${dark ? " nav__mobile-toggle--on" : ""}`}
                  aria-hidden="true"
                />
              </button>

              <div className="nav__mobile-langs" role="group" aria-label={copy.selectLanguage}>
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
              <Link to={localizedTo("/login")} className="nav__mobile-login-link" onClick={closeAll}>
                {n.login}
              </Link>
            )}
          </nav>

          {/* ── Right cluster: always visible in the header bar ── */}
          <div className="header__right">

            {/* Bell — visible in header on all screen sizes when logged in */}
            {user && (
              <Link
                to={localizedTo("/messages")}
                className="nav__bell"
                aria-label={unreadCount > 0 ? copy.unreadMessages(unreadCount) : copy.messages}
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
              aria-label={dark ? copy.lightMode : copy.darkMode}
              title={dark ? copy.lightMode : copy.darkMode}
            >
              {dark ? <SunIconOutline size={18} /> : <MoonIcon size={18} />}
            </button>

            {/* Language switcher — desktop only; mobile uses drawer version */}
            <LangSwitcher />

            {/* User dropdown — desktop only; mobile has full drawer section */}
            {user ? (
              <div className="nav__dropdown nav__dropdown--user header__user-desktop" ref={userMenu.ref}>
                <button
                  className={`nav__user-btn${userMenu.open ? " nav__user-btn--open" : ""}`}
                  onClick={() => userMenu.setOpen((v) => !v)}
                  aria-expanded={userMenu.open}
                  aria-haspopup="menu"
                  aria-label={copy.accountMenu(userName)}
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
                        to={localizedTo(isAdmin ? '/admin' : '/dashboard')}
                        className="nav__dropdown-item"
                        onClick={closeAll}
                        role="menuitem"
                      >
                        <span className="nav__dropdown-item-icon" aria-hidden="true">
                          {isAdmin ? <ShieldIcon size={ICON_SIZE} /> : <HomeIcon size={ICON_SIZE} />}
                        </span>
                        {n.dashboard}
                      </Link>
                    </li>
                    <li role="none">
                      <Link to={localizedTo("/billing")} className="nav__dropdown-item" onClick={closeAll} role="menuitem">
                        <span className="nav__dropdown-item-icon" aria-hidden="true"><CardIcon size={ICON_SIZE} /></span>
                        {n.invoices}
                      </Link>
                    </li>
                    <li role="none">
                      <Link to={localizedTo("/profile")} className="nav__dropdown-item" onClick={closeAll} role="menuitem">
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
              <Link to={localizedTo("/login")} className="btn btn--ghost-inv btn--sm">{n.login}</Link>
            )}

            {/* Search / Command Palette — desktop only; mobile has its own in the drawer */}
            <button
              className="nav__search-btn btn btn--icon btn--ghost-inv btn--sm"
              onClick={() => setCmdOpen(true)}
              aria-label={copy.searchPages}
              title={copy.searchPages}
            >
              <SearchIcon size={18} />
            </button>

            {/* Hamburger — shown only on mobile */}
            <button
              className="nav-toggle"
              aria-label={mobileOpen ? copy.closeNavigation : copy.openNavigation}
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
