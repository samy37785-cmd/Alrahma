// Mirrors backend/routes/parentRoutes.js's paths/methods, but every handler
// is an explicit, documented 501 (see parentController.js's module comment).
// parentOnly is NOT applied — Postgres has no 'parent' role, and there is
// nothing for RLS to gate here yet either. Mounted at /api/parent by app.js
// only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { linkChild, getChildren, getChildDetail, unlinkChild } from '../parentController.js';

const router = Router();

router.post('/link', protect, linkChild);
router.get('/children', protect, getChildren);
router.get('/children/:id', protect, getChildDetail);
router.delete('/children/:id', protect, unlinkChild);

export default router;
