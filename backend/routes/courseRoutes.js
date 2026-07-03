import { Router } from 'express';
import {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from '../controllers/courseController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();

// Public catalogue (no resources)
router.get('/', getCourses);
// Single course WITH resources — requires login; resources gated by subscription
router.get('/:id', protect, getCourse);

// Admin-only writes (CRUD)
router.post('/', protect, adminOnly, createCourse);
router.put('/:id', protect, adminOnly, updateCourse);
router.delete('/:id', protect, adminOnly, deleteCourse);

export default router;
