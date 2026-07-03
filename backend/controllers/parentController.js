import User from '../models/User.js';
import StudentRecord from '../models/StudentRecord.js';
import HifzProgress from '../models/HifzProgress.js';
import CourseProgress from '../models/CourseProgress.js';
import { asyncHandler } from '../utils/asyncHandler.js';

async function courseReport(studentId) {
  const rows = await CourseProgress.find({ user: studentId })
    .populate('course', 'title icon resources')
    .sort({ lastActivity: -1 });
  return rows
    .filter((r) => r.course)
    .map((r) => {
      const total = r.course.resources?.length || 0;
      const done  = r.completed.length;
      return {
        courseId: r.course._id,
        title:    r.course.title,
        icon:     r.course.icon,
        total,
        done,
        percent:  total ? Math.round((done / total) * 100) : 0,
        lastActivity: r.lastActivity,
      };
    });
}

// @desc  Parent: link to a child (student) using the code the student shared.
// @route POST /api/parent/link
// @body  { code }
// @access Private/Parent
export const linkChild = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) { res.status(400); throw new Error('Please enter the link code'); }

  const child = await User.findOne({ parentLinkCode: code, role: 'student' }).select('name email');
  if (!child) { res.status(404); throw new Error('No student found for that code'); }

  const parent = await User.findById(req.user._id);
  if (parent.children.some((c) => c.equals(child._id))) {
    res.status(409);
    throw new Error('This student is already linked to your account');
  }
  parent.children.push(child._id);
  await parent.save({ validateBeforeSave: false });

  res.status(201).json({ _id: child._id, name: child.name, email: child.email });
});

// @desc  Parent: list their linked children with a quick summary.
// @route GET /api/parent/children
// @access Private/Parent
export const getChildren = asyncHandler(async (req, res) => {
  const parent = await User.findById(req.user._id)
    .populate('children', 'name email subscription');

  const summaries = await Promise.all(
    (parent.children || []).map(async (c) => {
      const [recordCount, hifz] = await Promise.all([
        StudentRecord.countDocuments({ student: c._id }),
        HifzProgress.find({ user: c._id }).select('memorizedVerses'),
      ]);
      const memorized = hifz.reduce((sum, h) => sum + (h.memorizedVerses?.length || 0), 0);
      return {
        _id: c._id,
        name: c.name,
        email: c.email,
        subscription: c.subscription,
        recordCount,
        memorizedVerses: memorized,
      };
    })
  );
  res.json(summaries);
});

// @desc  Parent: read-only full profile of one of their linked children.
// @route GET /api/parent/children/:id
// @access Private/Parent
export const getChildDetail = asyncHandler(async (req, res) => {
  const parent = await User.findById(req.user._id).select('children');
  const linked = parent.children.some((c) => c.equals(req.params.id));
  if (!linked) { res.status(404); throw new Error('Child not linked to your account'); }

  const child = await User.findById(req.params.id).select('name email subscription');
  if (!child) { res.status(404); throw new Error('Student not found'); }

  const [records, hifz, courses] = await Promise.all([
    StudentRecord.find({ student: child._id })
      .populate('course', 'title icon')
      .populate('teacher', 'name')
      .sort('-date'),
    HifzProgress.find({ user: child._id }).sort({ chapterId: 1 }),
    courseReport(child._id),
  ]);
  res.json({ student: child, records, hifz, courses });
});

// @desc  Parent: unlink a child from their account.
// @route DELETE /api/parent/children/:id
// @access Private/Parent
export const unlinkChild = asyncHandler(async (req, res) => {
  const parent = await User.findById(req.user._id);
  parent.children = parent.children.filter((c) => !c.equals(req.params.id));
  await parent.save({ validateBeforeSave: false });
  res.json({ message: 'Child unlinked' });
});
