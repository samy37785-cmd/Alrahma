// Mirrors backend/routes/contactRoutes.js exactly. Mounted at /api/contact
// by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { submitContact, getContacts, contactValidation } from '../contactController.js';

const router = Router();

router.post('/', contactValidation, submitContact);
router.get('/', protect, adminOnly, getContacts);

export default router;
