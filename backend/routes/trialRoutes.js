import { Router } from 'express';
import { createTrial } from '../controllers/trialController.js';
import { trialLimiter } from '../config/rateLimit.js';
import { trialValidation, rejectInvalidTrial } from '../utils/trialValidation.js';

const router = Router();

// public: anyone can submit the form — rate-limited and strictly validated
router.post('/', trialLimiter, trialValidation, rejectInvalidTrial, createTrial);

export default router;
