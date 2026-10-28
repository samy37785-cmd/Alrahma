import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyHifz } from '../controllers/hifzController.js';

const router = Router();

router.get('/', protect, getMyHifz);
// PUT /:chapterId (mark a verse range memorized) is closed: no page uses it,
// and it built the whole requested range in memory, so any signed-in account
// could stall the server with one request (from=1, to=1e9).

export default router;
