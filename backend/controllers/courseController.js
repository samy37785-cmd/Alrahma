import Course from '../models/Course.js';

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
export async function getCourses(req, res, next) {
  try {
    // Exclude paid material (flat resources AND structured module lessons) from
    // the public catalogue; only return the lightweight module outline (titles).
    const courses = await Course.find({ published: true })
      .select('-resources -modules.lessons')
      .sort('-createdAt');
    res.json(courses);
  } catch (err) {
    next(err);
  }
}

// @desc   Get one course with its learning resources.
//         Requires login; resources are only returned to users with an
//         ACTIVE (non-expired) subscription. Otherwise the course meta is
//         returned with `locked: true` and no resource URLs.
// @route  GET /api/courses/:id
// @access Private
export async function getCourse(req, res, next) {
  try {
    const course = await Course.findOne({ _id: req.params.id, published: true });
    if (!course) {
      res.status(404);
      throw new Error('Course not found');
    }

    const unlocked = req.user?.hasActiveSubscription?.();
    const payload = unlocked ? course.toObject() : lockCourseContent(course.toObject());
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

// @desc   Create a course
// @route  POST /api/courses
// @access Private/Admin
export async function createCourse(req, res, next) {
  try {
    const course = await Course.create(req.body);
    res.status(201).json(course);
  } catch (err) {
    next(err);
  }
}

// @desc   Update a course
// @route  PUT /api/courses/:id
// @access Private/Admin
export async function updateCourse(req, res, next) {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!course) {
      res.status(404);
      throw new Error('Course not found');
    }
    res.json(course);
  } catch (err) {
    next(err);
  }
}

// @desc   Delete a course
// @route  DELETE /api/courses/:id
// @access Private/Admin
export async function deleteCourse(req, res, next) {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
      res.status(404);
      throw new Error('Course not found');
    }
    res.json({ message: 'Course deleted', id: req.params.id });
  } catch (err) {
    next(err);
  }
}
