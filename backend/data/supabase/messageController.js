// DATA_BACKEND=supabase controller for messages. Mirrors
// controllers/messageController.js's routes/response shapes, adapted for
// the same role-model difference documented in liveClassController.js:
// "student <-> assigned teacher" is a profiles.teacher_id relationship, not
// a role check — see can_message() (lib/db/drizzle/0013_admin_rbac.sql).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

function toJson(row) {
  return {
    _id: row.id,
    from: row.from_user_id,
    to: row.to_user_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

// @route GET /api/messages/contacts
// @access Private
export const getContacts = asyncHandler(async (req, res) => {
  const contacts = await withUserContext(req.user._id, async (client) => {
    // Mirrors can_message()'s own relationship: either my assigned teacher
    // (if I'm a student) or my assigned students (if I'm someone's teacher).
    const r = await client.query(
      `SELECT id, name, email, role FROM profiles
        WHERE id = (SELECT teacher_id FROM profiles WHERE id = $1)
           OR teacher_id = $1
        ORDER BY name`,
      [req.user._id]
    );
    return r.rows;
  });

  const withMeta = await withUserContext(req.user._id, async (client) => {
    // Sequential, not Promise.all (neither the outer map nor the inner
    // pair) — a single pg client can only run one query at a time; firing
    // several concurrently on it is deprecated, undefined behavior, not
    // real parallelism (same bug class found and fixed in
    // parentController.js/reviewController.js during the Al-Rahma Final
    // Corrections Part A rehearsal).
    const result = [];
    for (const c of contacts) {
      const unreadRes = await client.query(
        'SELECT count(*)::int AS n FROM messages WHERE from_user_id = $1 AND to_user_id = $2 AND read_at IS NULL',
        [c.id, req.user._id]
      );
      const lastRes = await client.query(
        `SELECT body, created_at, from_user_id FROM messages
          WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)
          ORDER BY created_at DESC LIMIT 1`,
        [req.user._id, c.id]
      );
      const last = lastRes.rows[0];
      result.push({
        _id: c.id, name: c.name, email: c.email, role: c.role,
        unread: unreadRes.rows[0].n,
        lastMessage: last
          ? { body: last.body, createdAt: last.created_at, mine: last.from_user_id === req.user._id }
          : null,
      });
    }
    return result;
  });

  res.json(withMeta);
});

// @route GET /api/messages/:userId
// @access Private
export const getConversation = asyncHandler(async (req, res) => {
  const otherId = req.params.userId;

  const messages = await withUserContext(req.user._id, async (client) => {
    const allowed = await client.query('SELECT can_message($1, $2) AS ok', [req.user._id, otherId]);
    if (!allowed.rows[0].ok) {
      const err = new Error('You cannot message this user');
      err.status = 403;
      throw err;
    }

    const r = await client.query(
      `SELECT * FROM messages
        WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)
        ORDER BY created_at`,
      [req.user._id, otherId]
    );
    await client.query(
      'UPDATE messages SET read_at = now() WHERE from_user_id = $1 AND to_user_id = $2 AND read_at IS NULL',
      [otherId, req.user._id]
    );
    return r.rows;
  });

  res.json(messages.map(toJson));
});

// @route POST /api/messages
// @access Private
export const sendMessage = asyncHandler(async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body?.trim()) {
    res.status(400);
    throw new Error('A recipient and a message are required');
  }

  try {
    const row = await withUserContext(req.user._id, async (client) => {
      const r = await client.query(
        'INSERT INTO messages (from_user_id, to_user_id, body) VALUES ($1, $2, $3) RETURNING *',
        [req.user._id, to, body.trim()]
      );
      return r.rows[0];
    });
    res.status(201).json(toJson(row));
  } catch (err) {
    if (err.code === '42501' || /row-level security/i.test(err.message)) {
      res.status(403);
      throw new Error('You cannot message this user');
    }
    throw err;
  }
});

// @route GET /api/messages/unread/count
// @access Private
export const getUnreadCount = asyncHandler(async (req, res) => {
  const unread = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'SELECT count(*)::int AS n FROM messages WHERE to_user_id = $1 AND read_at IS NULL',
      [req.user._id]
    );
    return r.rows[0].n;
  });
  res.json({ unread });
});
