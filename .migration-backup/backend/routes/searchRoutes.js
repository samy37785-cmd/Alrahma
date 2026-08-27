import { Router } from 'express';
import { globalSearch, searchCourses, searchTeachers } from '../controllers/searchController.js';

const router = Router();

router.get('/',          globalSearch);
router.get('/courses',   searchCourses);
router.get('/teachers',  searchTeachers);

export default router;
