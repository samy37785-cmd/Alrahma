import { Router } from 'express';
import { createTrial, getTrials } from '../controllers/trialController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { trialLimiter } from '../config/rateLimit.js';
import { trialValidation, rejectInvalidTrial } from '../utils/trialValidation.js';

const router = Router();

// public: anyone can submit the form — rate-limited and strictly validated
router.post('/', trialLimiter, trialValidation, rejectInvalidTrial, createTrial);
router.get('/', protect, adminOnly, getTrials); // admin: view submissions

export default router;
