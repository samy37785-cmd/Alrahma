import { asyncHandler } from '../utils/asyncHandler.js';
import Wishlist from '../models/Wishlist.js';

export const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id })
    .populate('courses.course', 'title description level thumbnail')
    .lean();

  res.json({ courses: wishlist?.courses ?? [] });
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ message: 'courseId is required' });

  const wishlist = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $addToSet: { courses: { course: courseId } } },
    { upsert: true, new: true },
  ).populate('courses.course', 'title description level thumbnail');

  res.json({ courses: wishlist.courses });
});

export const removeFromWishlist = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { courses: { course: courseId } } },
    { new: true },
  );

  res.json({ courses: wishlist?.courses ?? [] });
});

export const clearWishlist = asyncHandler(async (req, res) => {
  await Wishlist.findOneAndUpdate({ user: req.user._id }, { courses: [] });
  res.json({ message: 'Wishlist cleared' });
});
