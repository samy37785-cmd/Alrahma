// Mirrors backend/routes/teacherRoutes.js's paths/methods. teacherOnly is
// NOT applied (see teacherController.js's module comment — Postgres has no
// 'teacher' role; RLS enforces is_teacher_of() instead). Mounted at
// /api/teacher by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyStudents, getStudentDetail, addRecord, deleteRecord } from '../teacherController.js';

const router = Router();

router.get('/students', protect, getMyStudents);
router.get('/students/:id', protect, getStudentDetail);
router.post('/students/:id/records', protect, addRecord);
router.delete('/records/:recordId', protect, deleteRecord);

export default router;
