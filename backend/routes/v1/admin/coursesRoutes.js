import { Router } from 'express';
import mongoose from 'mongoose';
import Course from '../../../models/Course.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import { deleteCourseCascade } from '../../../controllers/courseController.js';
import { auditFromReq, toPlain } from '../../../services/auditService.js';
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

const CHANGED_SINCE_OPENED = 'This course was changed or deleted after you opened it, so your edits were not saved. Open it again to load the latest version.';

// The updatedAt the console loaded the course with: a date string, or null
// for a course stored without one. Returns undefined for anything else.
function parseExpectedUpdatedAt(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// The console's course form saves whole `resources` and `modules` arrays, so
// a save from a form opened before someone else's save (a second tab or
// device) would put the old lessons back. The console sends the updatedAt it
// loaded the course with, and the save goes through only if the stored course
// still has it:
// - checked here first, for a clear 409 when the course changed long ago;
// - and made a condition of the write itself (doc.$where), so two saves that
//   both passed the check at the same moment can't both land. MongoDB applies
//   the first; the second matches nothing and gets the same 409.
// A course stored without updatedAt is opened with `null`, which matches only
// while the field is still missing: the first save sets it.
// A request without the field (an older console) behaves as before: the same
// generic update, no check.
router.put('/:id', requirePermissions('courses:write'), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  const doc = await Course.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Course not found' });

  const { expectedUpdatedAt, ...body } = req.body ?? {};
  if (expectedUpdatedAt !== undefined) {
    const expected = parseExpectedUpdatedAt(expectedUpdatedAt);
    if (expected === undefined) {
      return res.status(422).json({ message: 'expectedUpdatedAt must be a date or null' });
    }
    const stored = doc.updatedAt ?? null;
    if ((stored?.getTime() ?? null) !== (expected?.getTime() ?? null)) {
      return res.status(409).json({ message: CHANGED_SINCE_OPENED });
    }
    // { updatedAt: null } also matches a document without the field.
    doc.$where = { updatedAt: stored };
  }

  const before = toPlain(doc);
  Object.assign(doc, body);
  try {
    await doc.save();
  } catch (err) {
    // The conditional write matched nothing: the course was saved (or
    // deleted) after it was read above. Mongoose reports that as a
    // VersionError when the save also bumps __v (whole arrays replaced),
    // otherwise as a DocumentNotFoundError.
    if (err instanceof mongoose.Error.VersionError || err instanceof mongoose.Error.DocumentNotFoundError) {
      return res.status(409).json({ message: CHANGED_SINCE_OPENED });
    }
    throw err;
  }

  await auditFromReq(req, 'course.update', 'Course', doc._id, before, doc);
  return res.json(doc);
}));

router.get('/',        requirePermissions('courses:read'),   asyncHandler(courses.list));
router.get('/:id',     requirePermissions('courses:read'),   asyncHandler(courses.getOne));
router.post('/',       requirePermissions('courses:write'),  asyncHandler(courses.create));

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
