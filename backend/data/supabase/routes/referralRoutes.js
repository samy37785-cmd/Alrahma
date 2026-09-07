// Mirrors backend/routes/referralRoutes.js exactly. Mounted at
// /api/referrals by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyReferrals, trackReferral } from '../referralController.js';

const router = Router();

router.get('/me', protect, getMyReferrals);
router.post('/track', protect, trackReferral);

export default router;
