import { site } from '../../data/site';
import {
  LayoutDashboard, MessageSquare, Users, BookOpen, CreditCard, Target, UserCog, Book, User, ExternalLink, Calendar, Heart, Sparkles, Users2, MessageCircle,
} from 'lucide-react';

// Stage 2A (see docs/user-admin-auth-contract.md): the product has exactly
// two navigation shapes now - `isAdmin` (a real, verified AdminUser + MFA
// session; see src/utils/accountRoles.js) and the single default `user`
// shape below it. There is no longer a teacher/parent branch: a legacy
// teacher/parent account normalizes to `user` and gets the same nav as
// everyone else.
export function navFor(isAdmin, unreadCount) {
  if (isAdmin) return [
    { section: 'main' },
    { to: '/admin',    icon: LayoutDashboard, labelKey: 'overview',  end: true },
    { section: 'management' },
    { to: '/admin#users',    icon: Users,      labelKey: 'users' },
    { to: '/admin#courses',  icon: BookOpen,   labelKey: 'courses' },
    { to: '/admin#payments', icon: CreditCard, labelKey: 'payments' },
    { to: '/admin#trials',   icon: Target,     labelKey: 'trials' },
    { to: '/admin#staff',    icon: UserCog,    labelKey: 'staff' },
    { section: 'community' },
    { to: '/messages', icon: MessageSquare, labelKey: 'messages', badge: unreadCount || 0 },
    { section: 'help' },
    { to: '/', icon: ExternalLink, labelKey: 'viewSite', external: true },
  ];

  return [
    { section: 'main' },
    { to: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', end: true },
    { section: 'learning' },
    { to: '/tools/quran-reader', icon: Book,        labelKey: 'quranReader' },
    { to: '/ai-tutor',           icon: Sparkles,      labelKey: 'aiTutor' },
    { to: '/calendar',           icon: Calendar,     labelKey: 'mySchedule' },
    { to: '/wishlist',           icon: Heart,         labelKey: 'wishlist' },
    { section: 'community' },
    { to: '/messages',  icon: MessageSquare, labelKey: 'messages',  badge: unreadCount || 0 },
    { to: '/community', icon: Users2,        labelKey: 'community' },
    { section: 'account' },
    { to: '/profile', icon: User,        labelKey: 'profile' },
    { to: '/billing', icon: CreditCard,  labelKey: 'billing' },
    { section: 'help' },
    { to: `https://wa.me/${site.whatsapp}`, icon: MessageCircle, labelKey: 'whatsappSupport', external: true },
    { to: '/',                              icon: ExternalLink,  labelKey: 'viewSite',        external: true },
  ];
}

export function roleLabel(user, isAdmin, roles) {
  if (isAdmin) return roles.administrator;
  return user?.subscription?.plan ? roles.plan(user.subscription.plan) : roles.student;
}

export function bottomNavFor(isAdmin, unreadCount) {
  if (isAdmin) return [
    { to: '/admin',    icon: LayoutDashboard, labelKey: 'overview',  end: true },
    { to: '/messages', icon: MessageSquare,   labelKey: 'messages',  badge: unreadCount },
    { to: '/admin#users', icon: Users,        labelKey: 'users' },
    { to: '/profile',  icon: User,            labelKey: 'profile' },
  ];
  return [
    { to: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', end: true },
    { to: '/messages',  icon: MessageSquare,   labelKey: 'messages',  badge: unreadCount },
    { to: '/tools/quran-reader', icon: Book,   labelKey: 'quranReader' },
    { to: '/profile',   icon: User,            labelKey: 'profile' },
  ];
}
