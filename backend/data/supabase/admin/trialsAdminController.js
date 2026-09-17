// Admin-router (DATA_BACKEND=supabase) controller for GET /api/v1/admin/trials.
// Production-readiness audit follow-up (2026-09-17): this was a genuine,
// standing gap — routes/v1/admin/index.js used to route this straight to
// backendNotImplemented() (501) under Supabase, even though
// trial_requests_select_admin (lib/db/drizzle/0002_rls.sql) already grants
// exactly the read this needs (is_admin(), AAL1, no new migration
// required) and the real trial_requests table has existed since the
// baseline schema. Mirrors controllers/trialController.js's getTrials
// response shape exactly (a bare array, newest first) — confirmed against
// artifacts/al-rahma-academy/src/api/contentApi.js's getTrials(), which
// expects `r.data` to be a plain array.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';

function toJson(row) {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    course: row.course,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

// @route GET /api/v1/admin/trials
export const list = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM trial_requests ORDER BY created_at DESC');
    return r.rows;
  });
  res.json(rows.map(toJson));
});
