import { NavLink, useLocation } from 'react-router-dom';
import { site } from '../../data/site';
import {
  LayoutDashboard, MessageSquare, Users, BookOpen, CreditCard, Target, UserCog, Book, User, ExternalLink, Calendar, ClipboardList, FileText, Heart, Sparkles, Users2, MessageCircle,
} from 'lucide-react';
/* Icon renderer — keeps icon size consistent across all nav items */
export function NavIcon({ icon: Icon, size = 16 }) {
  return <Icon size={size} aria-hidden="true" />;
}

export function navFor(isAdmin, isTeacher, isParent, unreadCount) {
  if (isAdmin) return [
    { section: 'MAIN' },
    { to: '/admin',    icon: LayoutDashboard, label: 'Overview',  end: true },
    { section: 'MANAGEMENT' },
    { to: '/admin#users',    icon: Users,      label: 'Users' },
    { to: '/admin#courses',  icon: BookOpen,   label: 'Courses' },
    { to: '/admin#payments', icon: CreditCard, label: 'Payments' },
    { to: '/admin#trials',   icon: Target,     label: 'Trials' },
    { to: '/admin#staff',    icon: UserCog,    label: 'Staff' },
    { section: 'COMMUNITY' },
    { to: '/messages', icon: MessageSquare, label: 'Messages', badge: unreadCount || 0 },
    { section: 'HELP' },
    { to: '/', icon: ExternalLink, label: 'View Site', external: true },
  ];

  if (isTeacher) return [
    { section: 'MAIN' },
    { to: '/teacher', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { section: 'TEACHING' },
    { to: '/calendar',           icon: Calendar,      label: 'Calendar' },
    { to: '/attendance',         icon: ClipboardList, label: 'Attendance' },
    { to: '/homework',           icon: FileText,       label: 'Homework' },
    { to: '/tools/quran-reader', icon: Book,           label: 'Quran Reader' },
    { section: 'COMMUNITY' },
    { to: '/messages', icon: MessageSquare, label: 'Messages', badge: unreadCount || 0 },
    { section: 'ACCOUNT' },
    { to: '/profile', icon: User, label: 'Profile' },
    { section: 'HELP' },
    { to: `https://wa.me/${site.whatsapp}`, icon: MessageCircle, label: 'WhatsApp Support', external: true },
    { to: '/',                              icon: ExternalLink,  label: 'View Site',        external: true },
  ];

  if (isParent) return [
    { section: 'MAIN' },
    { to: '/parent', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { section: 'COMMUNITY' },
    { to: '/messages', icon: MessageSquare, label: 'Messages', badge: unreadCount || 0 },
    { section: 'ACCOUNT' },
    { to: '/profile', icon: User, label: 'Profile' },
    { section: 'HELP' },
    { to: `https://wa.me/${site.whatsapp}`, icon: MessageCircle, label: 'WhatsApp Support', external: true },
    { to: '/',                              icon: ExternalLink,  label: 'View Site',        external: true },
  ];

  return [
    { section: 'MAIN' },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { section: 'LEARNING' },
    { to: '/tools/quran-reader', icon: Book,        label: 'Quran Reader' },
    { to: '/ai-tutor',           icon: Sparkles,      label: 'AI Tutor' },
    { to: '/calendar',           icon: Calendar,     label: 'My Schedule' },
    { to: '/homework',           icon: FileText,      label: 'Homework' },
    { to: '/wishlist',           icon: Heart,         label: 'Wishlist' },
    { section: 'COMMUNITY' },
    { to: '/messages',  icon: MessageSquare, label: 'Messages',  badge: unreadCount || 0 },
    { to: '/community', icon: Users2,        label: 'Community' },
    { section: 'ACCOUNT' },
    { to: '/profile', icon: User,        label: 'Profile' },
    { to: '/billing', icon: CreditCard,  label: 'Billing' },
    { section: 'HELP' },
    { to: `https://wa.me/${site.whatsapp}`, icon: MessageCircle, label: 'WhatsApp Support', external: true },
    { to: '/',                              icon: ExternalLink,  label: 'View Site',        external: true },
  ];
}

export function roleLabel(user, isAdmin, isTeacher, isParent) {
  if (isAdmin)   return 'Administrator';
  if (isTeacher) return 'Teacher';
  if (isParent)  return 'Parent';
  return user?.subscription?.plan ? `${user.subscription.plan} Plan` : 'Student';
}

export function bottomNavFor(isAdmin, isTeacher, isParent, unreadCount) {
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

export function MobileBottomNav({ isAdmin, isTeacher, isParent, unreadCount }) {
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
