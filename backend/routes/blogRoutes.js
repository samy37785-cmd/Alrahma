import { Router } from 'express';
import { listPosts, getPost } from '../controllers/blogController.js';

const router = Router();

router.get('/',      listPosts);
router.get('/:slug', getPost);

// Admin mutations (create/update/delete) now live at /api/v1/admin/blog
// (MFA + RBAC + audit-logged — see routes/v1/admin/blogRoutes.js).

export default router;
