import mongoose from 'mongoose';
import Course from '../models/Course.js';
import CourseProgress from '../models/CourseProgress.js';
import Wishlist from '../models/Wishlist.js';
import Certificate from '../models/Certificate.js';
import Review from '../models/Review.js';
import StudentRecord from '../models/StudentRecord.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Removes all paid material from a course object for users without an active
// subscription: clears flat resources and strips every lesson body, leaving
// only the module/lesson outline (titles + types). Pure + exported so it can be
// unit-tested. Returns a new object; never mutates the input.
export function lockCourseContent(course) {
  return {
    ...course,
    resources: [],
    modules: (course.modules || []).map((m) => ({
      ...m,
      lessons: (m.lessons || []).map((l) => ({
        _id: l._id, title: l.title, type: l.type, duration: l.duration,
        url: '', content: '', resources: [],
      })),
    })),
    locked: true,
  };
}

// @desc   Get all courses (public catalogue — resources are intentionally
//         excluded so paid material never leaks via the public listing).
// @route  GET /api/courses
// @access Public
export const getCourses = asyncHandler(async (req, res) => {
  // Exclude paid material (flat resources AND structured module lessons) from
  // the public catalogue; only return the lightweight module outline (titles).
  const courses = await Course.find({ published: true })
    .select('-resources -modules.lessons')
    .sort('-createdAt')
    .lean();
  // Safe to cache publicly: no user-specific data, no paid content.
  // 5-min fresh window + 60-s stale-while-revalidate means CDN and the
  // browser serve this instantly on repeat visits while staying up to date.
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json(courses);
});

// @desc   Get one course with its learning resources.
//         Requires login; resources are only returned to users with an
//         ACTIVE (non-expired) subscription. Otherwise the course meta is
//         returned with `locked: true` and no resource URLs.
// @route  GET /api/courses/:id
// @access Private
export const getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, published: true });
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  const unlocked = req.user?.hasActiveSubscription?.();
  const payload = unlocked ? course.toObject() : lockCourseContent(course.toObject());
  res.json(payload);
});

// @desc   Create a course
// @route  POST /api/courses
// @access Private/Admin
export const createCourse = asyncHandler(async (req, res) => {
  const course = await Course.create(req.body);
  res.status(201).json(course);
});

// @desc   Update a course
// @route  PUT /api/courses/:id
// @access Private/Admin
export const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }
  res.json(course);
});

// Deletes a course and cleans up every other collection that references it,
// so nothing is left pointing at a course that no longer exists. Both
// admin-facing delete routes (this file's deleteCourse and the v1 admin CRUD
// route in routes/v1/admin/coursesRoutes.js) call this — it's the single
// place course-deletion cascade logic lives.
//
// Cleanup differs by whether the referencing record has value on its own
// once the course link is gone:
//  - CourseProgress rows are meaningless without their course (and `course`
//    is a required field on that schema), so they're deleted outright.
//  - Certificates, reviews, and teacher session notes are legitimate records
//    in their own right (an earned certificate, a moderated review, a
//    session log) — only their course reference is cleared, not the record.
//  - A wishlist is a per-user array; the matching entry is pulled from it.
// Wrapped in a transaction so a crash mid-cleanup can't leave the course gone
// but its references still dangling.
export async function deleteCourseCascade(courseId) {
  const session = await mongoose.startSession();
  try {
    let deletedCourse = null;
    await session.withTransaction(async () => {
      deletedCourse = await Course.findByIdAndDelete(courseId).session(session);
      if (!deletedCourse) return;

      await Promise.all([
        CourseProgress.deleteMany({ course: courseId }).session(session),
        Wishlist.updateMany(
          { 'courses.course': courseId },
          { $pull: { courses: { course: courseId } } },
        ).session(session),
        Certificate.updateMany({ course: courseId }, { $set: { course: null } }).session(session),
        Review.updateMany({ course: courseId }, { $set: { course: null } }).session(session),
        StudentRecord.updateMany({ course: courseId }, { $set: { course: null } }).session(session),
      ]);
    });
    return deletedCourse;
  } finally {
    session.endSession();
  }
}

// @desc   Delete a course
// @route  DELETE /api/courses/:id
// @access Private/Admin
export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await deleteCourseCascade(req.params.id);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }
  res.json({ message: 'Course deleted', id: req.params.id });
});
