// Mirrors backend/routes/quranBookmarkRoutes.js exactly (same paths, methods,
// `protect` middleware) — only the controller implementation differs.
// Mounted at /api/quran-bookmarks by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyBookmarks, addBookmark, removeBookmark } from '../quranBookmarkController.js';

const router = Router();

router.get('/',            protect, getMyBookmarks);
router.post('/',           protect, addBookmark);
router.delete('/:verseKey', protect, removeBookmark);

export default router;
