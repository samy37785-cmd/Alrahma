import { Router } from 'express';
import { protect, teacherOnly } from '../middleware/auth.js';
import {
  getMyStudents, getStudentDetail, addRecord, deleteRecord,
} from '../controllers/teacherController.js';

const router = Router();

router.get('/students', protect, teacherOnly, getMyStudents);
router.get('/students/:id', protect, teacherOnly, getStudentDetail);
router.post('/students/:id/records', protect, teacherOnly, addRecord);
router.delete('/records/:recordId', protect, teacherOnly, deleteRecord);

export default router;
