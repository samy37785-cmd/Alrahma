import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { createPost, updatePost, deletePost, blogValidation, blogUpdateValidation } from './blogAdminController.js';

const router = Router();

router.post('/',      requirePermissions('blog:write'), blogValidation,       asyncHandler(createPost));
router.patch('/:id',  requirePermissions('blog:write'), blogUpdateValidation, asyncHandler(updatePost));
router.delete('/:id', requirePermissions('blog:write'), asyncHandler(deletePost));

export default router;
