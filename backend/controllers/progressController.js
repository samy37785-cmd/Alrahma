import CourseProgress from '../models/CourseProgress.js';
import Course from '../models/Course.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// @desc  Admin/teacher: a student's progress across all their courses.
// @route GET /api/progress/user/:userId
// @access Admin
export const getUserProgress = asyncHandler(async (req, res) => {
  const rows = await CourseProgress.find({ user: req.params.userId })
    .populate('course', 'title icon resources modules')
    .sort({ lastActivity: -1 });
  const report = rows
    .filter((r) => r.course) // skip deleted courses
    .map((r) => {
      const lessonCount = (r.course.modules || []).reduce((n, m) => n + (m.lessons?.length || 0), 0);
      const total = (r.course.resources?.length || 0) + lessonCount;
      const done  = r.completed.length;
      return {
        courseId:     r.course._id,
        title:        r.course.title,
        icon:         r.course.icon,
        total,
        done,
        percent:      total ? Math.round((done / total) * 100) : 0,
        lastActivity: r.lastActivity,
      };
    });
  res.json(report);
});

// @desc  Get the logged-in student's progress for one course.
// @route GET /api/progress/:courseId
// @access Private
export const getCourseProgress = asyncHandler(async (req, res) => {
  const row = await CourseProgress.findOne({ user: req.user._id, course: req.params.courseId });
  res.json({ completed: row?.completed || [], lastActivity: row?.lastActivity || null });
});

// @desc  Toggle a lesson/resource as done for the logged-in student.
// @route PUT /api/progress/:courseId
// @body  { url, done: true|false }
// @access Private (active subscription required — same gate as the content)
export const toggleProgress = asyncHandler(async (req, res) => {
  if (!req.user.hasActiveSubscription?.()) {
    res.status(403);
    throw new Error('An active subscription is required');
  }

  const { url, lessonId, done = true } = req.body;
  if (!url && !lessonId) { res.status(400); throw new Error('A resource url or lessonId is required'); }

  const course = await Course.findById(req.params.courseId).select('resources modules');
  if (!course) { res.status(404); throw new Error('Course not found'); }

  // The completion key is the resource URL (legacy flat resources) or
  // "lesson:<id>" for a structured module lesson. Either way we verify it
  // really belongs to this course before recording it.
  let key;
  if (lessonId) {
    const exists = course.modules?.some((m) => m.lessons?.some((l) => String(l._id) === String(lessonId)));
    if (!exists) { res.status(400); throw new Error('Unknown lesson for this course'); }
    key = `lesson:${lessonId}`;
  } else {
    const valid = course.resources.some((r) => r.url === url);
    if (!valid) { res.status(400); throw new Error('Unknown resource for this course'); }
    key = url;
  }

  const row =
    (await CourseProgress.findOne({ user: req.user._id, course: req.params.courseId })) ||
    new CourseProgress({ user: req.user._id, course: req.params.courseId });

  const set = new Set(row.completed);
  if (done) set.add(key);
  else      set.delete(key);

  row.completed     = [...set];
  row.lastActivity  = new Date();
  await row.save();

  res.json({ completed: row.completed });
});
