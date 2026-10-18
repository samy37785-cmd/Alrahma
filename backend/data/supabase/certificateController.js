// DATA_BACKEND=supabase controller for certificates — the read-only
// student/admin listing endpoints only (mirrors routes/certificateRoutes.js
// exactly: GET /mine, GET / [admin]). Issuance/revocation are admin
// mutations gated by is_admin_aal2() + authorize('certificates:write') via
// the issue_certificate()/revoke_certificate() RPCs (lib/db/drizzle/
// 0015_new_domains_rls.sql) — no admin-router adapter wires them up yet, a
// documented gap (same shape as courses/reviews/referrals/contact admin
// mutations, all customer-router-only in this adapter set so far).
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

const SELECT_WITH_COURSE = `
  SELECT c.*, co.title AS course_title
    FROM certificates c
    LEFT JOIN courses co ON co.id = c.course_id`;

// @route GET /api/certificates/mine
// @access Private
export const getMyCertificates = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `${SELECT_WITH_COURSE} WHERE c.user_id = $1 AND c.revoked = false ORDER BY c.issued_at DESC`,
      [req.user._id]
    );
    return r.rows;
  });
  res.json(rows.map(toJson));
});

// @route GET /api/certificates?userId=...
// @access Admin
export const listCertificates = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    const r = req.query.userId
      ? await client.query(`${SELECT_WITH_COURSE} WHERE c.user_id = $1 ORDER BY c.issued_at DESC`, [req.query.userId])
      : await client.query(`${SELECT_WITH_COURSE} ORDER BY c.issued_at DESC`);
    return r.rows;
  });
  res.json(rows.map(toJson));
});
