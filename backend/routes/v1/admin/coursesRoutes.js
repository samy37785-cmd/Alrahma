import { Router } from 'express';
import mongoose from 'mongoose';
import Course from '../../../models/Course.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import { deleteCourseCascade } from '../../../controllers/courseController.js';
import { auditFromReq } from '../../../services/auditService.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

const courses = createCRUDController(Course, {
  resourceName:   'Course',
  defaultLimit:   50,
  maxLimit:       500,
  searchFields:   ['title', 'description'],
  allowedFilters: ['level', 'language', 'isPublished'],
  sortable:       ['createdAt', 'updatedAt', 'title'],
  // The console's course form saves whole `resources` and `modules` arrays,
  // so a save from a form opened before someone else's save (a second tab or
  // device) would silently put the old lessons back. The console sends the
  // updatedAt it loaded the course with; if the course was saved since, the
  // save is refused with a 409 and nothing changes. A request without the
  // field keeps the old behaviour.
  updateMiddleware: async (body, doc) => {
    const { expectedUpdatedAt, ...rest } = body ?? {};
    if (expectedUpdatedAt === undefined) return rest;
    const expected = typeof expectedUpdatedAt === 'string' ? new Date(expectedUpdatedAt) : null;
    if (!expected || Number.isNaN(expected.getTime())) {
      const err = new Error('expectedUpdatedAt must be a date');
      err.statusCode = 422;
      throw err;
    }
    if (!doc.updatedAt || doc.updatedAt.getTime() !== expected.getTime()) {
      const err = new Error('This course was changed after you opened it, so your edits were not saved. Open it again to load the latest version.');
      err.statusCode = 409;
      throw err;
    }
    return rest;
  },
});

router.get('/',        requirePermissions('courses:read'),   asyncHandler(courses.list));
router.get('/:id',     requirePermissions('courses:read'),   asyncHandler(courses.getOne));
router.post('/',       requirePermissions('courses:write'),  asyncHandler(courses.create));
router.put('/:id',     requirePermissions('courses:write'),  asyncHandler(courses.update));

// Deliberately NOT the generic courses.remove() — a course delete must also
// clean up references in CourseProgress/Wishlist/Certificate/Review/
// StudentRecord (see deleteCourseCascade in courseController.js). Preserves
// the same request/response contract courses.remove() had (permission check,
// 400 on a malformed id, 404 shape, audit log action name and severity).
router.delete('/:id', requirePermissions('courses:delete'), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  const course = await deleteCourseCascade(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });

  await auditFromReq(req, 'course.delete', 'Course', course._id, course, null, 'warning');
  return res.json({ message: 'Course deleted successfully' });
}));

export default router;
