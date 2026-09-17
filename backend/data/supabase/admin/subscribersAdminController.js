// Admin-router (DATA_BACKEND=supabase) controller for GET /api/v1/admin/subscribers.
// Production-readiness audit follow-up (2026-09-17): same standing gap and
// fix as trialsAdminController.js — subscribers_select_admin
// (lib/db/drizzle/0002_rls.sql) already grants the read this needs
// (is_admin(), AAL1), no new migration required. Mirrors
// controllers/subscriberController.js's listSubscribers response shape
// exactly (a bare array, newest first) — confirmed against
// artifacts/al-rahma-academy/src/api/contentApi.js's getSubscribers().
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';

function toJson(row) {
  return {
    _id: row.id,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
  };
}

// @route GET /api/v1/admin/subscribers
export const list = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM subscribers ORDER BY created_at DESC');
    return r.rows;
  });
  res.json(rows.map(toJson));
});
