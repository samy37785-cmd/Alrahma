import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getMyNotifications, markNotifRead, markAllNotifsRead } from '../../api/notificationApi';

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

// Mirrors models/Notification.js's TYPES enum.
const ICON_MAP = {
  class_scheduled:        '📅',
  class_cancelled:        '🚫',
  class_reminder:         '⏰',
  payment_received:       '💳',
  payment_failed:         '⚠️',
  subscription_renewed:   '🔄',
  subscription_expiring:  '⏳',
  message_received:       '✉',
  enrollment_approved:    '✅',
  enrollment_rejected:    '❌',
  certificate_issued:     '🎓',
  admin_announcement:     '📢',
  coupon_received:        '🎁',
  review_approved:        '⭐',
  default:                '🔔',
};

const PAGE_SIZE = 10;

export default function NotificationPanel({ onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', 'list', limit],
    queryFn: () => getMyNotifications({ limit }),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markReadMutation = useMutation({
    mutationFn: markNotifRead,
    onSuccess: invalidate,
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotifsRead,
    onSuccess: invalidate,
  });

  const handleItemClick = (n) => {
    const id = n._id || n.id;
    if (!n.read) markReadMutation.mutate(id);
    if (n.link) navigate(n.link);
    onClose?.();
  };

  return (
    <div className="ds-notif" role="region" aria-label="Notifications">
      <div className="ds-notif__hd">
        <span className="ds-notif__title">
          Notifications {unreadCount > 0 && `(${unreadCount})`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {unreadCount > 0 && (
            <button
              className="ds-notif__mark-btn"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              Mark all read
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close notifications"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1, padding: 2 }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="ds-notif__list">
        {isLoading ? (
          <div className="ds-notif__empty">Loading notifications…</div>
        ) : isError ? (
          <div className="ds-notif__empty">
            Couldn&apos;t load notifications.<br />
            <button
              onClick={() => refetch()}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-brand)', fontSize: '0.75rem', marginTop: 6 }}
            >
              Try again
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="ds-notif__empty">
            🎉 You&apos;re all caught up!<br />
            <span style={{ fontSize: '0.75rem' }}>No new notifications.</span>
          </div>
        ) : (
          <>
            {notifications.map((n) => {
              const id = n._id || n.id;
              const isUnread = !n.read;
              const icon = ICON_MAP[n.type] || ICON_MAP.default;
              return (
                <div
                  key={id}
                  className={`ds-notif__item${isUnread ? ' ds-notif__item--unread' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleItemClick(n)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleItemClick(n); } }}
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
            })}
            {total > notifications.length && (
              <button
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-brand)', fontSize: '0.78rem', padding: '10px 0' }}
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
