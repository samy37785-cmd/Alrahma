import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyProgress, updatePosition, updateGoal, logReading } from '../controllers/quranProgressController.js';

const router = Router();

router.get('/',          protect, getMyProgress);
router.put('/position',  protect, updatePosition);
router.put('/goal',      protect, updateGoal);
router.post('/log',      protect, logReading);

export default router;
