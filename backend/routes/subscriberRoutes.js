import { Router } from 'express';
import { subscribe } from '../controllers/subscriberController.js';

const router = Router();

router.post('/', subscribe);

export default router;
