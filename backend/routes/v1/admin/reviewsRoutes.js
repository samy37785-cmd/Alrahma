import { Router } from 'express';
import { moderateReview, reviewModerationValidation } from '../../../controllers/reviewController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Submitting a review (POST /api/reviews) and public reads
// (GET /api/reviews/teacher/:teacherId, GET /api/reviews/course/:courseId)
// stay on the legacy router — only the admin moderation mutation moved here.
router.patch('/:id/moderate', requirePermissions('reviews:write'), reviewModerationValidation, asyncHandler(moderateReview));

export default router;
