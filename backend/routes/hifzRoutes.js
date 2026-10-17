import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyHifz, markMemorized } from '../controllers/hifzController.js';

const router = Router();

router.get('/', protect, getMyHifz);
router.put('/:chapterId', protect, markMemorized);

export default router;
