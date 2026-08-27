import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} from '../controllers/wishlistController.js';

const router = Router();

router.use(protect);

router.get('/',                  getWishlist);
router.post('/',                 addToWishlist);
router.delete('/clear',          clearWishlist);
router.delete('/:courseId',      removeFromWishlist);

export default router;
