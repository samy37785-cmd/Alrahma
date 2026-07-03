import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  issueCertificate,
  getMyCertificates,
  listCertificates,
  revokeCertificate,
} from '../controllers/certificateController.js';

const router = Router();

// Student: my certificates
router.get('/mine', protect, getMyCertificates);

// Admin: issue / list / revoke
router.post('/', protect, adminOnly, issueCertificate);
router.get('/', protect, adminOnly, listCertificates);
router.delete('/:id', protect, adminOnly, revokeCertificate);

export default router;
