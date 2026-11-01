import mongoose from 'mongoose';
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
  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: 'courseId is not valid' });

  // $addToSet never matched an existing entry here: each one gets its own
  // _id and addedAt, so every click added the course again. Push only when
  // the course is not in the list yet.
  await Wishlist.updateOne({ user: req.user._id }, { $setOnInsert: { courses: [] } }, { upsert: true });
  await Wishlist.updateOne(
    { user: req.user._id, 'courses.course': { $ne: courseId } },
    { $push: { courses: { course: courseId } } },
  );
  const wishlist = await Wishlist.findOne({ user: req.user._id })
    .populate('courses.course', 'title description level thumbnail');

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
