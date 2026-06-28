import Course from '../models/Course.js';

// @desc   Get all courses
// @route  GET /api/courses
// @access Public
export async function getCourses(req, res, next) {
  try {
    const courses = await Course.find({ published: true }).sort('-createdAt');
    res.json(courses);
  } catch (err) {
    next(err);
  }
}

// @desc   Get one course by id
// @route  GET /api/courses/:id
// @access Public
export async function getCourse(req, res, next) {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      res.status(404);
      throw new Error('Course not found');
    }
    res.json(course);
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
