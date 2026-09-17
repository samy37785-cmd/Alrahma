// Admin-router (DATA_BACKEND=supabase) controller for certificate
// listing/issuance/revocation. issue_certificate()/revoke_certificate()
// (lib/db/drizzle/0015_new_domains_rls.sql) already enforce
// is_admin_aal2() + authorize('certificates:write') AND write their own
// admin_audit_log row — the mutation wrappers below are thin HTTP
// wrappers, matching routes/v1/admin/certificatesRoutes.js's contract
// (GET /, POST /, DELETE /:id).
//
// Production-readiness audit follow-up (2026-09-17): `list` is new. GET
// /api/v1/admin/certificates was previously unreachable under
// DATA_BACKEND=supabase at all (certificatesRouter in adminRoutes.js only
// had POST/DELETE) — a real, live gap: AdminProgressModal.jsx's
// listCertificates(userId) is a real active consumer of this exact route.
// certificates_select_own_non_revoked_or_admin (0015_new_domains_rls.sql)
// already grants admin SELECT (is_admin(), AAL1, no new migration needed)
// — this was a missing adapter, not a missing DB capability, same shape as
// the trials/subscribers gap closed earlier in this same pass.
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
    course: row.course_id ? { _id: row.course_id, title: row.course_title } : null,
    issuedBy: row.issued_by,
    grade: row.grade,
    notes: row.notes,
    issuedAt: row.issued_at,
    revoked: row.revoked,
    createdAt: row.created_at,
  };
}

// @route GET /api/v1/admin/certificates?userId=...
// Mirrors controllers/certificateController.js's listCertificates exactly:
// admin sees every certificate (including revoked), optionally scoped to
// one student.
export const list = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = req.query.userId
      ? await client.query(
          `SELECT c.*, co.title AS course_title FROM certificates c
             LEFT JOIN courses co ON co.id = c.course_id
            WHERE c.user_id = $1 ORDER BY c.issued_at DESC`,
          [req.query.userId]
        )
      : await client.query(
          `SELECT c.*, co.title AS course_title FROM certificates c
             LEFT JOIN courses co ON co.id = c.course_id
            ORDER BY c.issued_at DESC`
        );
    return r.rows;
  });
  res.json(rows.map(toJson));
});

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
