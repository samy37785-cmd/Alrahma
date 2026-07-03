import CourseProgress from '../models/CourseProgress.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const XP_PER_LESSON = 20;
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 6000, 9000];

function calcLevel(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

const BADGES = {
  first_lesson:  { key: 'first_lesson',  xpRequired: 0,    label: 'First Step' },
  level_5:       { key: 'level_5',       xpRequired: 900,  label: 'Rising Scholar' },
  streak_7:      { key: 'streak_7',      streakRequired: 7, label: '7-Day Streak' },
  streak_30:     { key: 'streak_30',     streakRequired: 30, label: '30-Day Streak' },
};

async function awardXP(userId, amount) {
  const user = await User.findById(userId).select('+xp +level +streak +lastStudyDate +badges');
  if (!user) return;

  user.xp = (user.xp || 0) + amount;

  // Streak logic: consecutive calendar days
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastDay = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
  if (lastDay) { lastDay.setHours(0, 0, 0, 0); }
  const dayDiff = lastDay ? Math.round((today - lastDay) / 86400000) : 9;
  if (dayDiff === 1) {
    user.streak = (user.streak || 0) + 1;
  } else if (dayDiff > 1) {
    user.streak = 1;
  }
  user.lastStudyDate = new Date();

  user.level = calcLevel(user.xp);

  // Badge checks
  const earned = new Set(user.badges || []);
  if (!earned.has('first_lesson')) earned.add('first_lesson');
  if (user.level >= 5 && !earned.has('level_5')) earned.add('level_5');
  if (user.streak >= 7 && !earned.has('streak_7')) earned.add('streak_7');
  if (user.streak >= 30 && !earned.has('streak_30')) earned.add('streak_30');
  user.badges = [...earned];

  await user.save({ validateBeforeSave: false });
  return { xp: user.xp, level: user.level, streak: user.streak, badges: user.badges };
}

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

  const wasNew = done && !row.completed.includes(key);
  row.completed     = [...set];
  row.lastActivity  = new Date();
  await row.save();

  let gamification = null;
  if (wasNew) gamification = await awardXP(req.user._id, XP_PER_LESSON);

  res.json({ completed: row.completed, gamification });
});
