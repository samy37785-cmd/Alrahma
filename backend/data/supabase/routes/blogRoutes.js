// Mirrors backend/routes/blogRoutes.js exactly (public GET routes only —
// admin mutations live at /api/v1/admin/blog under either backend and are
// not part of this file). Mounted at /api/blog by app.js only when
// DATA_BACKEND=supabase.
import { Router } from 'express';
import { listPosts, getPost } from '../blogController.js';

const router = Router();

router.get('/', listPosts);
router.get('/:slug', getPost);

export default router;
