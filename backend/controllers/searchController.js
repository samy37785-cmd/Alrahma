import { asyncHandler } from '../middleware/asyncHandler.js';
import Course from '../models/Course.js';
import Blog from '../models/Blog.js';
import User from '../models/User.js';

export const globalSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ message: 'Search query must be at least 2 characters' });
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');
  const limit = 5;

  const [courses, posts, teachers] = await Promise.all([
    Course.find({ $or: [{ title: regex }, { description: regex }] })
      .select('title description level')
      .limit(limit)
      .lean(),
    Blog.find({ published: true, $or: [{ title: regex }, { excerpt: regex }, { tags: regex }] })
      .select('slug title excerpt category')
      .limit(limit)
      .lean(),
    User.find({ role: 'teacher', $or: [{ name: regex }, { specialization: regex }] })
      .select('name specialization')
      .limit(limit)
      .lean(),
  ]);

  res.json({ q, results: { courses, posts, teachers } });
});

export const searchCourses = asyncHandler(async (req, res) => {
  const q      = (req.query.q || '').trim();
  const level  = req.query.level;
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = Math.min(20, parseInt(req.query.limit) || 12);
  const skip   = (page - 1) * limit;

  const filter = {};
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ title: regex }, { description: regex }, { tags: regex }];
  }
  if (level) filter.level = level;

  const [courses, total] = await Promise.all([
    Course.find(filter).select('title description level thumbnail').skip(skip).limit(limit).lean(),
    Course.countDocuments(filter),
  ]);

  res.json({ courses, total, page, pages: Math.ceil(total / limit) });
});

export const searchTeachers = asyncHandler(async (req, res) => {
  const q        = (req.query.q || '').trim();
  const subject  = req.query.subject;
  const gender   = req.query.gender;
  const language = req.query.language;
  const page     = Math.max(1, parseInt(req.query.page) || 1);
  const limit    = Math.min(20, parseInt(req.query.limit) || 12);
  const skip     = (page - 1) * limit;

  const filter = { role: 'teacher' };
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ name: regex }, { specialization: regex }, { bio: regex }];
  }
  if (subject)  filter.subjects  = subject;
  if (gender)   filter.gender    = gender;
  if (language) filter.languages = language;

  const [teachers, total] = await Promise.all([
    User.find(filter).select('name specialization gender languages rating').skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  res.json({ teachers, total, page, pages: Math.ceil(total / limit) });
});
