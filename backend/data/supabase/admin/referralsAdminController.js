// Admin-router (DATA_BACKEND=supabase) controller for
// /api/v1/admin/referrals. referrals_convert_admin_aal2
// (0015_new_domains_rls.sql) requires is_admin_aal2() + authorize('referrals:write').
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';

function toJson(row) {
  return {
    _id: row.id,
    referrer: row.referrer_id,
    referee: row.referee_id,
    code: row.code,
    status: row.status,
    convertedAt: row.converted_at,
    createdAt: row.created_at,
  };
}

// @route PATCH /api/v1/admin/referrals/:id/convert
export const convertReferral = asyncHandler(async (req, res) => {
  let row;
  let didConvert = false;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const existing = await client.query('SELECT * FROM referrals WHERE id = $1', [req.params.id]);
      if (!existing.rows[0]) return null;
      if (existing.rows[0].status !== 'pending') return existing.rows[0];

      const r = await client.query(
        `UPDATE referrals SET status = 'converted', converted_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      didConvert = true;
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Referral not found' });
  if (didConvert) {
    await auditAdminAction({ adminId: req.adminUser.id, action: 'referral.convert', resourceType: 'referrals', resourceId: row.id, after: row });
  }
  res.json(toJson(row));
});
