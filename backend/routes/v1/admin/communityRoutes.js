import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import {
  moderatePost,
  moderateComment,
  moderationValidation,
} from '../../../controllers/communityController.js';

const router = Router();

// Admin reads (for the moderation queue UI) stay on the legacy
// protect+adminOnly router (routes/communityRoutes.js) — only the
// moderation mutation lives here, same convention as reviews.
router.patch('/posts/:id/moderate',    requirePermissions('community:write'), moderationValidation, moderatePost);
router.patch('/comments/:id/moderate', requirePermissions('community:write'), moderationValidation, moderateComment);

export default router;
