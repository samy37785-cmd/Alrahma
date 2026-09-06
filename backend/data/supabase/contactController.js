// DATA_BACKEND=supabase controller for contact_messages. Mirrors
// controllers/contactController.js's routes/response shapes for
// submitContact (public) and getContacts (admin list). updateContactStatus
// is an admin mutation gated by is_admin_aal2() + authorize('contact:write')
// — no admin-router adapter wires it up yet (documented gap, same shape as
// courses/certificates/reviews/referrals admin mutations).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { handleValidationErrors } from '../../utils/validationHelper.js';
import { parsePagination } from '../../utils/pagination.js';
import { withAnonContext, withUserContext } from './client.js';

export { contactValidation } from '../../controllers/contactController.js';

function toJson(row) {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    assignedTo: row.assigned_to,
    adminNote: row.admin_note,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
  };
}

// @route POST /api/contact
// @access Public
export const submitContact = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { name, email, phone, subject, message } = req.body;

  // contact_messages_insert_public grants INSERT on exactly these 5 columns
  // (0015_new_domains_rls.sql) — id/status/created_at all take their
  // defaults. Same structural gap as enrollments/trial_requests: anon has no
  // SELECT grant at all, so the new row's id genuinely cannot be returned.
  await withAnonContext(async (client) => {
    await client.query(
      'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1,$2,$3,$4,$5)',
      [name, email, phone ?? null, subject, message]
    );
  });

  res.status(201).json({ message: 'Message received. We will get back to you soon.', id: null });
});

// @route GET /api/contact
// @access Admin
export const getContacts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const status = req.query.status;

  const { rows, total } = await withUserContext(req.user._id, async (client) => {
    const [listRes, countRes] = status
      ? await Promise.all([
          client.query(
            'SELECT * FROM contact_messages WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
            [status, limit, skip]
          ),
          client.query('SELECT count(*)::int AS total FROM contact_messages WHERE status = $1', [status]),
        ])
      : await Promise.all([
          client.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, skip]),
          client.query('SELECT count(*)::int AS total FROM contact_messages'),
        ]);
    return { rows: listRes.rows, total: countRes.rows[0].total };
  });

  res.json({ contacts: rows.map(toJson), total, page, pages: Math.ceil(total / limit) });
});
