// DATA_BACKEND=supabase controller for contact_messages. Mirrors
// controllers/contactController.js's routes/response shapes for
// submitContact (public) and getContacts (admin list). updateContactStatus
// is an admin mutation gated by is_admin_aal2() + authorize('contact:write')
// — no admin-router adapter wires it up yet (documented gap, same shape as
// courses/certificates/reviews/referrals admin mutations).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { handleValidationErrors } from '../../utils/validationHelper.js';
import { withAnonContext } from './client.js';

export { contactValidation } from '../../controllers/contactController.js';

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

