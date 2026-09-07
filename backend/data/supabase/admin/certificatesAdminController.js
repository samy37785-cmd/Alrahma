// Admin-router (DATA_BACKEND=supabase) controller for certificate issuance/
// revocation. issue_certificate()/revoke_certificate() (lib/db/drizzle/
// 0015_new_domains_rls.sql) already enforce is_admin_aal2() +
// authorize('certificates:write') AND write their own admin_audit_log row —
// this controller is a thin HTTP wrapper, matching routes/v1/admin/
// certificatesRoutes.js's contract (POST / , DELETE /:id).
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';

function toJson(row) {
  return {
    _id: row.id,
    certificateNumber: row.certificate_number,
    user: row.user_id,
    studentName: row.student_name,
    type: row.type,
    title: row.title,
    course: row.course_id,
    issuedBy: row.issued_by,
    grade: row.grade,
    notes: row.notes,
    issuedAt: row.issued_at,
    revoked: row.revoked,
  };
}

// @route POST /api/v1/admin/certificates
export const issueCertificate = asyncHandler(async (req, res) => {
  const { user, studentName, type, title, course, issuedBy, grade, notes } = req.body;
  if (!user || !studentName || !type || !title) {
    return res.status(400).json({ message: 'user, studentName, type and title are required' });
  }

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `SELECT * FROM issue_certificate($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user, studentName, type, title, course || null, issuedBy || req.adminUser.name || null, grade || null, notes || null]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  res.status(201).json(toJson(row));
});

// @route DELETE /api/v1/admin/certificates/:id
export const revokeCertificate = asyncHandler(async (req, res) => {
  try {
    await withUserContext(req.adminUser.id, async (client) => {
      await client.query(`SELECT revoke_certificate($1)`, [req.params.id]);
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
  res.json({ message: 'Certificate revoked successfully' });
});
