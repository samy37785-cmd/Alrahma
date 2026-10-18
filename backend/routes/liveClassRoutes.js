import { Router } from 'express';
import { protect, teacherOnly } from '../middleware/auth.js';
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
} from '../controllers/liveClassController.js';

const router = Router();

// All routes require a logged-in user. Listing is role-aware (see controller);
// creating/editing/deleting is for a teacher and their own classes only. A
// regular account with role 'admin' used to manage every class here with a
// password alone; the admin console now does that through
// /api/v1/admin/live-classes (MFA + IP allowlist + RBAC).
router.use(protect);

router.get('/', listClasses);
router.post('/', teacherOnly, createClass);
router.patch('/:id', teacherOnly, updateClass);
router.delete('/:id', teacherOnly, deleteClass);

export default router;
