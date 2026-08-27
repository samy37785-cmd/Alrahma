import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyBookmarks, addBookmark, removeBookmark } from '../controllers/quranBookmarkController.js';

const router = Router();

router.get('/',            protect, getMyBookmarks);
router.post('/',           protect, addBookmark);
router.delete('/:verseKey', protect, removeBookmark);

export default router;
