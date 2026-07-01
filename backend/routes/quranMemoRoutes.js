import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyMemoStats, updateMemoGoal, logPractice } from '../controllers/quranMemoController.js';

const router = Router();

router.get('/',       protect, getMyMemoStats);
router.put('/goal',   protect, updateMemoGoal);
router.post('/log',   protect, logPractice);

export default router;
