import { Router } from 'express';
import { protect, parentOnly } from '../middleware/auth.js';
import {
  linkChild, getChildren, getChildDetail, unlinkChild,
} from '../controllers/parentController.js';

const router = Router();

router.post('/link', protect, parentOnly, linkChild);
router.get('/children', protect, parentOnly, getChildren);
router.get('/children/:id', protect, parentOnly, getChildDetail);
router.delete('/children/:id', protect, parentOnly, unlinkChild);

export default router;
