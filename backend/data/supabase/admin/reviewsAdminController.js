// Admin-router (DATA_BACKEND=supabase) controller for review moderation.
// Backed by reviews_moderate_admin_aal2 (lib/db/drizzle/
// 0015_new_domains_rls.sql), a raw RLS-gated UPDATE (not an RPC) — so this
// controller writes its own admin_audit_log row via auditAdminAction(),
// matching routes/v1/admin/reviewsRoutes.js's contract
// (PATCH /:id/moderate -> { review }).
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';

function toJson(row) {
  return {
    _id: row.id,
    student: row.student_id,
    teacher: row.teacher_id,
    course: row.course_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    helpful: row.helpful,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_STATUSES = ['pending', 'approved', 'rejected'];

// @route PATCH /api/v1/admin/reviews/:id/moderate
export const moderateReview = asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(422).json({ message: 'status must be pending, approved, or rejected' });
  }
  if (adminNote !== undefined && String(adminNote).length > 500) {
    return res.status(422).json({ message: 'adminNote must be at most 500 characters' });
  }

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE reviews SET
           status = COALESCE($2, status),
           admin_note = COALESCE($3, admin_note)
         WHERE id = $1
         RETURNING *`,
        [req.params.id, status ?? null, adminNote ?? null]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Review not found' });

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'review.moderate', resourceType: 'reviews',
    resourceId: row.id, after: row,
  });

  res.json({ review: toJson(row) });
});
