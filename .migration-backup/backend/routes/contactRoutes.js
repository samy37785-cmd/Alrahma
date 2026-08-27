import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { submitContact, getContacts } from '../controllers/contactController.js';
import { contactValidation } from '../validators/contactValidators.js';

const router = Router();

// Public — anyone can submit a contact message
router.post('/', contactValidation, submitContact);

router.get('/', protect, adminOnly, getContacts);

// Admin mutation (status update) now lives at /api/v1/admin/contact
// (MFA + RBAC + audit-logged — see routes/v1/admin/contactRoutes.js).

export default router;
