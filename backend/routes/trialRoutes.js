import { Router } from 'express';
import { createTrial } from '../controllers/trialController.js';
import { trialLimiter } from '../config/rateLimit.js';
import { trialValidation, rejectInvalidTrial } from '../utils/trialValidation.js';
import { whatsappValidation, useWhatsappAsPhone } from '../middleware/trialWhatsappAlias.js';

const router = Router();

// public: anyone can submit the form — rate-limited and strictly validated.
// This route alone also takes the phone number under its old name
// `whatsapp` (middleware/trialWhatsappAlias.js); the dormant Supabase route
// does not.
router.post('/', trialLimiter, trialValidation, whatsappValidation, rejectInvalidTrial, useWhatsappAsPhone, createTrial);

export default router;
