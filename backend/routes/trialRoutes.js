import { Router } from 'express';
import { createTrial, getTrials } from '../controllers/trialController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/', createTrial); // public: anyone can submit the form
router.get('/', protect, adminOnly, getTrials); // admin: view submissions

export default router;
