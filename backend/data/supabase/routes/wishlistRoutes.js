// Mirrors backend/routes/wishlistRoutes.js exactly (including route order —
// /clear must be declared before /:courseId). Mounted at /api/wishlist by
// app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getWishlist, addToWishlist, removeFromWishlist, clearWishlist } from '../wishlistController.js';

const router = Router();

router.use(protect);

router.get('/', getWishlist);
router.post('/', addToWishlist);
router.delete('/clear', clearWishlist);
router.delete('/:courseId', removeFromWishlist);

export default router;
