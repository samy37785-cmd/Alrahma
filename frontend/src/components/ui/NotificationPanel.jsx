import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ICON_MAP = {
  class:    '📅',
  message:  '✉',
  payment:  '💳',
  course:   '📚',
  system:   '⚙',
  default:  '🔔',
};

export default function NotificationPanel() {
  const { data: notifs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        // The real export is getMyNotifications, and it resolves the full
        // paginated response body ({ notifications, total, unreadCount, ... }),
        // not a bare array — both had to match for this to ever return real
        // data instead of silently falling through to [] below.
        const { getMyNotifications } = await import('../../api/notificationApi');
        const res = await getMyNotifications();
        return res.notifications;
      } catch {
        return [];
      }
    },
    staleTime: 30000,
  });

  const [read, setRead] = useState(new Set());

  const markAll = () => setRead(new Set(notifs.map((n) => n._id || n.id)));

  const displayed = notifs.slice(0, 20);
  const unread = displayed.filter((n) => !read.has(n._id || n.id));

  return (
    <div className="ds-notif" role="region" aria-label="Notifications">
      <div className="ds-notif__hd">
        <span className="ds-notif__title">
          Notifications {unread.length > 0 && `(${unread.length})`}
        </span>
        {unread.length > 0 && (
          <button className="ds-notif__mark-btn" onClick={markAll}>
            Mark all read
          </button>
        )}
      </div>

      <div className="ds-notif__list">
        {displayed.length === 0 ? (
          <div className="ds-notif__empty">
            🎉 You&apos;re all caught up!<br />
            <span style={{ fontSize: '0.75rem' }}>No new notifications.</span>
          </div>
        ) : (
          displayed.map((n) => {
            const id = n._id || n.id;
            const isUnread = !read.has(id);
            const icon = ICON_MAP[n.type] || ICON_MAP.default;
            return (
              <div
                key={id}
                className={`ds-notif__item${isUnread ? ' ds-notif__item--unread' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setRead((r) => new Set([...r, id]))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRead((r) => new Set([...r, id])); } }}
              >
                <div className="ds-notif__item-icon">{icon}</div>
                <div className="ds-notif__item-body">
                  <div className="ds-notif__item-title">{n.title || n.message}</div>
                  {n.body && <div className="ds-notif__item-desc">{n.body}</div>}
                  <div className="ds-notif__item-time">{timeAgo(n.createdAt)}</div>
                </div>
                {isUnread && <div className="ds-notif__dot" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
