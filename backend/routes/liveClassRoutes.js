import { Router } from 'express';
import { protect, staffOnly } from '../middleware/auth.js';
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
} from '../controllers/liveClassController.js';

const router = Router();

// All routes require a logged-in user. Listing is role-aware (see controller);
// creating/editing/deleting is staff-only (teacher or admin).
router.use(protect);

router.get('/', listClasses);
router.post('/', staffOnly, createClass);
router.patch('/:id', staffOnly, updateClass);
router.delete('/:id', staffOnly, deleteClass);

export default router;
