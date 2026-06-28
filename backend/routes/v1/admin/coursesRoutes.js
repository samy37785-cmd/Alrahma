import { Router } from 'express';
import Course from '../../../models/Course.js';
import { createCRUDController } from '../../../controllers/crudController.js';
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
router.delete('/:id',  requirePermissions('courses:delete'), asyncHandler(courses.remove));

export default router;
