import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  blogValidation,
} from '../controllers/blogController.js';

const router = Router();

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  next();
};

router.get('/',         listPosts);
router.get('/:slug',    getPost);
router.post('/',        protect, adminOnly, blogValidation, createPost);
router.patch('/:id',    protect, adminOnly, updatePost);
router.delete('/:id',   protect, adminOnly, deletePost);

export default router;
