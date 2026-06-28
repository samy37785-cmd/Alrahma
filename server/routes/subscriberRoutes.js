import { Router } from 'express';
import { subscribe, listSubscribers } from '../controllers/subscriberController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/', subscribe);
router.get('/', protect, adminOnly, listSubscribers);

export default router;
