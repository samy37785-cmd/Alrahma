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
