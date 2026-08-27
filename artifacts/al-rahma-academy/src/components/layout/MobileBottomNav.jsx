import { NavLink, useLocation } from 'react-router-dom';
import NavIcon from './NavIcon';
import { bottomNavFor } from './dashboardNav';

export default function MobileBottomNav({ isAdmin, isTeacher, isParent, unreadCount }) {
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
