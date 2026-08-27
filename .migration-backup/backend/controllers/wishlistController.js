import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import Wishlist from '../models/Wishlist.js';
import Course from '../models/Course.js';

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

export const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id })
    .populate('courses.course', 'title description level thumbnail')
    .lean();

  res.json({ courses: wishlist?.courses ?? [] });
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ message: 'courseId is required' });
  if (!isValidObjectId(courseId)) return res.status(400).json({ message: 'Invalid ID format' });

  const course = await Course.findById(courseId).select('_id').lean();
  if (!course) return res.status(404).json({ message: 'Course not found' });

  // Plain $addToSet does NOT dedupe here: each embedded course subdocument
  // also carries addedAt (schema default: Date.now), which Mongoose re-casts
  // fresh on every request. MongoDB's $addToSet compares the whole embedded
  // document for equality, so two adds of the same course a moment apart are
  // never equal and both get pushed — silently defeating the "set" semantics
  // the operator is named for. Guard explicitly instead: ensure the wishlist
  // document exists, then only push when this course isn't already in it.
  await Wishlist.updateOne(
    { user: req.user._id },
    { $setOnInsert: { user: req.user._id, courses: [] } },
    { upsert: true },
  );
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
  if (!isValidObjectId(courseId)) return res.status(400).json({ message: 'Invalid ID format' });

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
