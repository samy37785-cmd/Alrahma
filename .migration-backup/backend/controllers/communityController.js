import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { parsePagination } from '../utils/pagination.js';
import { auditFromReq } from '../services/auditService.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import { createNotification } from '../services/notificationService.js';

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}



// @desc  Public feed — approved posts only, with each post's approved
//        comment count computed on the fly (not denormalized, so there's
//        nothing to keep in sync when a comment's moderation status changes).
export const listPosts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });

  const [posts, total] = await Promise.all([
    Post.aggregate([
      { $match: { status: 'approved' } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'comments',
          let: { postId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$post', '$$postId'] }, { $eq: ['$status', 'approved'] }] } } },
            { $count: 'count' },
          ],
          as: 'commentStats',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      { $unwind: '$author' },
      {
        $project: {
          body: 1, likes: 1, createdAt: 1, author: 1,
          commentCount: { $ifNull: [{ $arrayElemAt: ['$commentStats.count', 0] }, 0] },
        },
      },
    ]),
    Post.countDocuments({ status: 'approved' }),
  ]);

  res.json({ posts, total, page, pages: Math.ceil(total / limit) });
});

// @desc  The current student's own posts, any status — so they can see a
//        post is still pending review or was rejected, not just silently
//        missing from the public feed.
export const getMyPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find({ author: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(posts);
});

export const createPost = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  const post = await Post.create({ author: req.user._id, body: req.body.body });
  res.status(201).json(post);
});

export const deletePost = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID format' });
  const deleted = await Post.findOneAndDelete({ _id: req.params.id, author: req.user._id });
  if (!deleted) return res.status(404).json({ message: 'Post not found' });
  await Comment.deleteMany({ post: deleted._id });
  res.json({ message: 'Post deleted' });
});

export const toggleLike = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID format' });
  const post = await Post.findOne({ _id: req.params.id, status: 'approved' });
  if (!post) return res.status(404).json({ message: 'Post not found' });

  const liked = post.likes.some((id) => id.equals(req.user._id));
  const updated = await Post.findByIdAndUpdate(
    post._id,
    liked ? { $pull: { likes: req.user._id } } : { $addToSet: { likes: req.user._id } },
    { new: true },
  ).select('likes');

  res.json({ liked: !liked, likeCount: updated.likes.length });
});

export const listComments = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID format' });
  const comments = await Comment.find({ post: req.params.id, status: 'approved' })
    .populate('author', 'name')
    .sort({ createdAt: 1 })
    .lean();
  res.json(comments);
});

export const createComment = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID format' });

  const post = await Post.findOne({ _id: req.params.id, status: 'approved' }).select('_id');
  if (!post) return res.status(404).json({ message: 'Post not found' });

  const comment = await Comment.create({ post: post._id, author: req.user._id, body: req.body.body });
  res.status(201).json(comment);
});

export const deleteComment = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID format' });
  const deleted = await Comment.findOneAndDelete({ _id: req.params.id, author: req.user._id });
  if (!deleted) return res.status(404).json({ message: 'Comment not found' });
  res.json({ message: 'Comment deleted' });
});

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN MODERATION — mounted under routes/v1/admin/communityRoutes.js,
   gated by requirePermissions('community:write') (TOTP-MFA AdminUser
   session), same pattern as reviewController's moderateReview/listReviews.
   ═══════════════════════════════════════════════════════════════════════ */


export const listPostsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Post.countDocuments(filter),
  ]);

  res.json({ posts, total, page, pages: Math.ceil(total / limit) });
});

export const moderatePost = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID format' });

  const before = await Post.findById(req.params.id).select('status author').lean();
  if (!before) return res.status(404).json({ message: 'Post not found' });

  const { status, adminNote } = req.body;
  const post = await Post.findByIdAndUpdate(
    req.params.id,
    { status, ...(adminNote !== undefined && { adminNote }) },
    { new: true, runValidators: true },
  );
  await auditFromReq(req, 'community.moderatePost', 'Post', post._id, null, post, 'info');

  if (status === 'approved' && before.status !== 'approved') {
    await createNotification({
      recipient: post.author,
      type:      'post_approved',
      title:     'Your post was approved',
      body:      'Your community post has been approved and is now visible to others.',
      link:      '/community',
    });
  }

  res.json({ post });
});

export const listCommentsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [comments, total] = await Promise.all([
    Comment.find(filter)
      .populate('author', 'name email')
      .populate('post', 'body')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Comment.countDocuments(filter),
  ]);

  res.json({ comments, total, page, pages: Math.ceil(total / limit) });
});

export const moderateComment = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID format' });

  const before = await Comment.findById(req.params.id).select('status author post').lean();
  if (!before) return res.status(404).json({ message: 'Comment not found' });

  const { status, adminNote } = req.body;
  const comment = await Comment.findByIdAndUpdate(
    req.params.id,
    { status, ...(adminNote !== undefined && { adminNote }) },
    { new: true, runValidators: true },
  );
  await auditFromReq(req, 'community.moderateComment', 'Comment', comment._id, null, comment, 'info');

  if (status === 'approved' && before.status !== 'approved') {
    await createNotification({
      recipient: comment.author,
      type:      'comment_approved',
      title:     'Your comment was approved',
      body:      'Your community comment has been approved and is now visible to others.',
      link:      '/community',
    });
  }

  res.json({ comment });
});
