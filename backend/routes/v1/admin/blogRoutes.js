import { Router } from 'express';
import { createPost, updatePost, deletePost } from '../../../controllers/blogController.js';
import { blogValidation, blogUpdateValidation } from '../../../validators/blogValidators.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Public listing/reading (GET /api/blog, GET /api/blog/:slug) stays on the
// legacy router — only the admin mutations moved here.
router.post('/',     requirePermissions('blog:write'), blogValidation,       asyncHandler(createPost));
router.patch('/:id', requirePermissions('blog:write'), blogUpdateValidation, asyncHandler(updatePost));
router.delete('/:id', requirePermissions('blog:write'), asyncHandler(deletePost));

export default router;
