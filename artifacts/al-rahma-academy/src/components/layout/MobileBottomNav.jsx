import { NavLink, useLocation } from 'react-router-dom';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';
import NavIcon from './NavIcon';
import { bottomNavFor } from './dashboardNav';

export default function MobileBottomNav({ isAdmin, isTeacher, isParent, unreadCount }) {
  const location = useLocation();
  const { lang } = useLang();
  const { shell, items: itemLabels } = getExperienceText(lang).dashboard;
  const items = bottomNavFor(isAdmin, isTeacher, isParent, unreadCount);

  const isActive = (item) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname.startsWith(item.to.split('#')[0]);
  };

  return (
    <nav className="ds-bottom-nav" aria-label={shell.mobileNavigation}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={`ds-bottom-nav__item${isActive(item) ? ' ds-bottom-nav__item--active' : ''}`}
          aria-current={isActive(item) ? 'page' : undefined}
          aria-label={item.badge > 0
            ? `${itemLabels[item.labelKey]} (${item.badge} ${shell.unread})`
            : itemLabels[item.labelKey]}
        >
          <span className="ds-bottom-nav__icon">
            <item.icon size={22} aria-hidden="true" />
            {item.badge > 0 && (
              <span className="ds-bottom-nav__badge" aria-hidden="true">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </span>
          <span className="ds-bottom-nav__label">{itemLabels[item.labelKey]}</span>
        </NavLink>
      ))}
    </nav>
  );
}
