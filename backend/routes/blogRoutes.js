import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  blogValidation,
  blogUpdateValidation,
} from '../controllers/blogController.js';

const router = Router();

router.get('/',         listPosts);
router.get('/:slug',    getPost);
router.post('/',        protect, adminOnly, blogValidation, createPost);
router.patch('/:id',    protect, adminOnly, blogUpdateValidation, updatePost);
router.delete('/:id',   protect, adminOnly, deletePost);

export default router;
