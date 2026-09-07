// Mirrors backend/routes/liveClassRoutes.js's paths/methods. staffOnly is
// NOT applied here (see liveClassController.js's module comment — Postgres
// has no 'teacher' role; RLS enforces the equivalent is_teacher_of()
// authorization instead). Mounted at /api/classes by app.js only when
// DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { listClasses, createClass, updateClass, deleteClass } from '../liveClassController.js';

const router = Router();

router.use(protect);

router.get('/', listClasses);
router.post('/', createClass);
router.patch('/:id', updateClass);
router.delete('/:id', deleteClass);

export default router;
