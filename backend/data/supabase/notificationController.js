// DATA_BACKEND=supabase notifications controller. Mirrors
// controllers/notificationController.js's routes/response shapes for the
// caller-scoped endpoints (list/unread-count/mark-read/mark-all-read/
// delete). Notification *creation* is triggered by other business logic
// outside this domain's own routes and isn't part of this adapter — see the
// notification_type gap note below, which only matters for INSERT paths.
//
// Stage 2E documented notification_type as having only 7 of Mongo's values.
// Stage 2F added the missing 9 (0014_close_partial_gaps_schema.sql —
// class_scheduled/class_cancelled/class_reminder/message_received/
// enrollment_approved/enrollment_rejected/certificate_issued/
// coupon_received/review_approved), closing that gap at the schema level.
// Irrelevant to every route in this file regardless (all pure reads/mark-
// read/delete on existing rows, never an INSERT) — nothing in this file
// needed to change; the new values simply make future INSERTs (e.g. from a
// live_classes/messages/referrals adapter) representable, which was not
// possible before this migration.
//
// notifications has no raw UPDATE policy at all (see lib/db/drizzle/
// 0002_rls.sql, "18. notifications") — the only way to mark a row read is
// the mark_notification_read(p_id) SECURITY DEFINER RPC, which internally
// checks `WHERE id = p_id AND user_id = auth.uid()`. There is no bulk
// "mark all read" RPC, so markAllRead loops one RPC call per unread
// notification id inside a single withUserContext transaction — see its
// own comment for the perf tradeoff that implies.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { withUserContext } from './client.js';

function toJson(row) {
  return {
    _id: row.id,
    recipient: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read,
    data: row.meta ?? {},
    createdAt: row.created_at,
  };
}

// @route GET /api/notifications
export const getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const unreadOnly = req.query.unread === 'true';
  // unreadOnly only ever toggles between two fixed, non-user-controlled SQL
  // fragments below — never interpolated from request data.
  const whereClause = unreadOnly ? 'user_id = $1 AND read = false' : 'user_id = $1';

  const { notifications, total, unreadCount } = await withUserContext(req.user._id, async (client) => {
    const [listRes, totalRes, unreadRes] = await Promise.all([
      client.query(
        `SELECT * FROM notifications WHERE ${whereClause} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [req.user._id, limit, skip]
      ),
      client.query(`SELECT count(*)::int AS count FROM notifications WHERE ${whereClause}`, [req.user._id]),
      client.query(
        'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false',
        [req.user._id]
      ),
    ]);
    return {
      notifications: listRes.rows,
      total: totalRes.rows[0].count,
      unreadCount: unreadRes.rows[0].count,
    };
  });

  res.json({
    notifications: notifications.map(toJson),
    total,
    unreadCount,
    page,
    pages: Math.ceil(total / limit),
  });
});

// @route GET /api/notifications/unread
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false',
      [req.user._id]
    );
    return r.rows[0].count;
  });
  res.json({ count });
});

// @route PATCH /api/notifications/:id/read
export const markRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query('SELECT * FROM mark_notification_read($1)', [id]);
    return r.rows[0];
  });
  if (!row) return res.status(404).json({ message: 'Notification not found' });
  res.json({ notification: toJson(row) });
});

// @route PATCH /api/notifications/read-all
export const markAllRead = asyncHandler(async (req, res) => {
  await withUserContext(req.user._id, async (client) => {
    const unread = await client.query(
      'SELECT id FROM notifications WHERE user_id = $1 AND read = false',
      [req.user._id]
    );
    // No bulk "mark all read" RPC exists in the migrations (only the
    // single-id mark_notification_read(p_id) SECURITY DEFINER function),
    // and notifications has no raw UPDATE policy/grant at all — so this is
    // N round-trips for a user with N unread notifications. Acceptable for
    // a personal notification inbox's typical size; revisit (e.g. a bulk
    // RPC) if that assumption stops holding.
    for (const { id } of unread.rows) {
      await client.query('SELECT mark_notification_read($1)', [id]);
    }
  });
  res.json({ message: 'All notifications marked as read' });
});

// @route DELETE /api/notifications/:id
export const deleteNotification = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user._id]
    );
    return r.rows[0];
  });
  if (!row) return res.status(404).json({ message: 'Notification not found' });
  res.json({ message: 'Notification deleted' });
});
