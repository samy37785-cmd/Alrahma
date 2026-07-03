import { body } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { parsePagination } from '../utils/pagination.js';
import Blog from '../models/Blog.js';

export const blogValidation = [
  body('slug').trim().toLowerCase().notEmpty().matches(/^[a-z0-9-]+$/),
  body('title').trim().notEmpty().isLength({ max: 200 }),
  body('excerpt').trim().notEmpty().isLength({ max: 500 }),
  body('body').trim().notEmpty(),
  body('author.name').trim().notEmpty(),
];

export const listPosts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 9, maxLimit: 20 });
  const { category, tag } = req.query;

  const filter = { published: true };
  if (category) filter.category = category;
  if (tag) filter.tags = tag;

  const [posts, total] = await Promise.all([
    Blog.find(filter, 'slug title excerpt category tags author coverImage readTime publishedAt views')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Blog.countDocuments(filter),
  ]);

  // Blog listings change infrequently; cache for 5 min, serve stale for 60 s
  // while revalidating in the background.
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ posts, total, page, pages: Math.ceil(total / limit) });
});

export const getPost = asyncHandler(async (req, res) => {
  const post = await Blog.findOneAndUpdate(
    { slug: req.params.slug, published: true },
    { $inc: { views: 1 } },
    { new: true },
  ).lean();

  if (!post) return res.status(404).json({ message: 'Post not found' });
  res.json({ post });
});

export const createPost = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  const post = await Blog.create(req.body);
  res.status(201).json({ post });
});

export const updatePost = asyncHandler(async (req, res) => {
  const post = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!post) return res.status(404).json({ message: 'Post not found' });
  res.json({ post });
});

export const deletePost = asyncHandler(async (req, res) => {
  const post = await Blog.findByIdAndDelete(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  res.json({ message: 'Post deleted' });
});
