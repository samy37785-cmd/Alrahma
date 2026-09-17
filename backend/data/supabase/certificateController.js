// DATA_BACKEND=supabase controller for certificates — the customer-facing
// self-service read only (GET /mine). Admin listing/issuance/revocation
// all live at /api/v1/admin/certificates (see data/supabase/admin/
// certificatesAdminController.js, mounted through adminRoutes.js's
// certificatesRouter -> routes/v1/admin/index.js).
// Production-readiness audit follow-up (2026-09-17): this file used to
// also export an admin listCertificates() that no route ever actually
// mounted (a real, live gap — GET /api/v1/admin/certificates 404'd under
// DATA_BACKEND=supabase, and AdminProgressModal.jsx is a real active
// consumer of it). Moved into certificatesAdminController.js (using the
// real req.adminUser.id admin context, not this file's req.user._id) and
// wired up for real, rather than left here unreachable.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

function toJson(row) {
  return {
    _id: row.id,
    certificateNumber: row.certificate_number,
    user: row.user_id,
    studentName: row.student_name,
    type: row.type,
    title: row.title,
    course: row.course_id ? { _id: row.course_id, title: row.course_title } : null,
    issuedBy: row.issued_by,
    grade: row.grade,
    notes: row.notes,
    issuedAt: row.issued_at,
    revoked: row.revoked,
    createdAt: row.created_at,
  };
}

// @route GET /api/certificates/mine
// @access Private
export const getMyCertificates = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT c.*, co.title AS course_title FROM certificates c
         LEFT JOIN courses co ON co.id = c.course_id
        WHERE c.user_id = $1 AND c.revoked = false ORDER BY c.issued_at DESC`,
      [req.user._id]
    );
    return r.rows;
  });
  res.json(rows.map(toJson));
});
