import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  submitContact,
  getContacts,
  updateContactStatus,
  contactValidation,
} from '../controllers/contactController.js';

const router = Router();

// Public — anyone can submit a contact message
router.post('/', contactValidation, submitContact);

// Admin-only endpoints use the adminAuth flow (handled separately in admin routes).
// These are exposed here as a convenience under /api/contact for the admin SPA
// but guard themselves with protect + role check.
router.get('/',     protect, (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  next();
}, getContacts);

router.patch('/:id', protect, (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  next();
}, updateContactStatus);

export default router;
