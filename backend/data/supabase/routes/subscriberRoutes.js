// Mirrors backend/routes/subscriberRoutes.js exactly (same paths, methods,
// middleware) — only the controller implementation differs. Mounted at
// /api/newsletter by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { subscribe, listSubscribers } from '../subscriberController.js';
import { protect, adminOnly } from '../../../middleware/auth.js';

const router = Router();

router.post('/', subscribe);
router.get('/', protect, adminOnly, listSubscribers);

export default router;
