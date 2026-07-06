import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  submitContact,
  getContacts,
  updateContactStatus,
  contactValidation,
  contactStatusValidation,
} from '../controllers/contactController.js';

const router = Router();

// Public — anyone can submit a contact message
router.post('/', contactValidation, submitContact);

// Admin-only endpoints use the adminAuth flow (handled separately in admin routes).
// These are exposed here as a convenience under /api/contact for the admin SPA
// but guard themselves with protect + role check.
router.get('/',     protect, adminOnly, getContacts);
router.patch('/:id', protect, adminOnly, contactStatusValidation, updateContactStatus);

export default router;
