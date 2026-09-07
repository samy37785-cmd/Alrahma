// Admin-router (DATA_BACKEND=supabase) controller for
// /api/v1/admin/contact. contact_messages_update_admin_aal2
// (0015_new_domains_rls.sql) requires is_admin_aal2() + authorize('contact:write').
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { handleValidationErrors } from '../../../utils/validationHelper.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';

export { contactStatusValidation } from '../../../controllers/contactController.js';

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

// @route PATCH /api/v1/admin/contact/:id
export const updateContactStatus = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  const { status, adminNote } = req.body;

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE contact_messages SET
           status = COALESCE($2, status),
           admin_note = COALESCE($3, admin_note),
           replied_at = CASE WHEN $2 = 'resolved' THEN now() ELSE replied_at END
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

  if (!row) return res.status(404).json({ message: 'Contact message not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'contact.status.update', resourceType: 'contact_messages', resourceId: row.id, after: row });
  res.json({ contact: toJson(row) });
});
