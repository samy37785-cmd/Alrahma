import CourseProgress from '../models/CourseProgress.js';
import Course from '../models/Course.js';

// @desc  Admin/teacher: a student's progress across all their courses.
// @route GET /api/progress/user/:userId
// @access Admin
export async function getUserProgress(req, res, next) {
  try {
    const rows = await CourseProgress.find({ user: req.params.userId })
      .populate('course', 'title icon resources')
      .sort({ lastActivity: -1 });
    const report = rows
      .filter((r) => r.course) // skip deleted courses
      .map((r) => {
        const total = r.course.resources?.length || 0;
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
  } catch (err) {
    next(err);
  }
}

// @desc  Get the logged-in student's progress for one course.
// @route GET /api/progress/:courseId
// @access Private
export async function getCourseProgress(req, res, next) {
  try {
    const row = await CourseProgress.findOne({ user: req.user._id, course: req.params.courseId });
    res.json({ completed: row?.completed || [], lastActivity: row?.lastActivity || null });
  } catch (err) {
    next(err);
  }
}

// @desc  Toggle a lesson/resource as done for the logged-in student.
// @route PUT /api/progress/:courseId
// @body  { url, done: true|false }
// @access Private (active subscription required — same gate as the content)
export async function toggleProgress(req, res, next) {
  try {
    if (!req.user.hasActiveSubscription?.()) {
      res.status(403);
      throw new Error('An active subscription is required');
    }

    const { url, done = true } = req.body;
    if (!url) { res.status(400); throw new Error('Resource url is required'); }

    // Verify the url actually belongs to this course's resources.
    const course = await Course.findById(req.params.courseId).select('resources');
    if (!course) { res.status(404); throw new Error('Course not found'); }
    const valid = course.resources.some((r) => r.url === url);
    if (!valid) { res.status(400); throw new Error('Unknown resource for this course'); }

    const row =
      (await CourseProgress.findOne({ user: req.user._id, course: req.params.courseId })) ||
      new CourseProgress({ user: req.user._id, course: req.params.courseId });

    const set = new Set(row.completed);
    if (done) set.add(url);
    else      set.delete(url);

    row.completed     = [...set];
    row.lastActivity  = new Date();
    await row.save();

    res.json({ completed: row.completed });
  } catch (err) {
    next(err);
  }
}
