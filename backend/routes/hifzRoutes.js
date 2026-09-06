import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { getMyHifz, markMemorized, getUserHifz } from '../controllers/hifzController.js';

const router = Router();

router.get('/', protect, getMyHifz);
router.put('/:chapterId', protect, markMemorized);
router.get('/user/:userId', protect, adminOnly, getUserHifz);

export default router;
