import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
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
    // published: true — this is a public endpoint; without the filter,
    // unpublished/draft course titles and descriptions leak into search
    // results (the Blog query below already had the equivalent guard).
    Course.find({ published: true, $or: [{ title: regex }, { description: regex }] })
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
  const q     = (req.query.q || '').trim();
  const level = req.query.level;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 20 });

  // published: true — same public-endpoint guard as globalSearch above.
  const filter = { published: true };
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
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 20 });

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
