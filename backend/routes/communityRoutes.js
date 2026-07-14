import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { communityLimiter } from '../config/rateLimit.js';
import {
  listPosts,
  getMyPosts,
  createPost,
  deletePost,
  toggleLike,
  listComments,
  createComment,
  deleteComment,
  listPostsAdmin,
  listCommentsAdmin,
} from '../controllers/communityController.js';
import { postValidation, commentValidation } from '../validators/communityValidators.js';

const router = Router();
router.use(protect);

router.get('/posts',        listPosts);
router.get('/posts/mine',   getMyPosts);
router.post('/posts',       communityLimiter, postValidation, createPost);
router.delete('/posts/:id', deletePost);
router.post('/posts/:id/like', toggleLike);

router.get('/posts/:id/comments',  listComments);
router.post('/posts/:id/comments', communityLimiter, commentValidation, createComment);
router.delete('/comments/:id',     deleteComment);

// Admin reads (any status, for the moderation queue UI) stay on the legacy
// protect+adminOnly router — same convention as coupons/contact/certificates/
// reviews. Only the moderation mutation lives on the hardened /v1/admin
// MFA stack (routes/v1/admin/communityRoutes.js).
router.get('/admin/posts',    adminOnly, listPostsAdmin);
router.get('/admin/comments', adminOnly, listCommentsAdmin);

export default router;
