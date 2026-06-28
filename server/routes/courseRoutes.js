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

// Public reads
router.get('/', getCourses);
router.get('/:id', getCourse);

// Admin-only writes (CRUD)
router.post('/', protect, adminOnly, createCourse);
router.put('/:id', protect, adminOnly, updateCourse);
router.delete('/:id', protect, adminOnly, deleteCourse);

export default router;
