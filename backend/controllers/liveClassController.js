import LiveClass from '../models/LiveClass.js';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { liveClassScheduledEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';

// Populates teacher/student names for the API response.
const POPULATE = [
  { path: 'teacher', select: 'name email' },
  { path: 'student', select: 'name email' },
];

// @desc  List live classes relevant to the caller, role-aware:
//        admin = all, teacher = theirs, student = their own, parent = children's.
// @route GET /api/classes  (optional ?upcoming=1 to hide past/cancelled)
// @access Private
export const listClasses = asyncHandler(async (req, res) => {
  const role = req.user.role;
  let filter;
  if (role === 'admin') {
    filter = {};
  } else if (role === 'teacher') {
    filter = { teacher: req.user._id };
  } else if (role === 'parent') {
    const parent = await User.findById(req.user._id).select('children').lean();
    filter = { student: { $in: parent?.children || [] } };
  } else {
    filter = { student: req.user._id };
  }

  if (req.query.upcoming) {
    filter.startsAt = { $gte: new Date() };
    filter.status = { $ne: 'cancelled' };
  }

  const classes = await LiveClass.find(filter).populate(POPULATE).sort('startsAt').lean();
  res.json(classes);
});

// @desc  Schedule a live class. Teachers may only schedule for their own
//        assigned students; admins may schedule for any student.
// @route POST /api/classes
// @access Private/Staff (teacher | admin)
export const createClass = asyncHandler(async (req, res) => {
  const { student, title, startsAt, durationMin, meetingUrl, notes } = req.body;
  if (!student || !title || !startsAt) {
    res.status(400);
    throw new Error('student, title and startsAt are required');
  }
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) {
    res.status(400);
    throw new Error('startsAt is not a valid date');
  }

  // A teacher can only schedule for a student assigned to them.
  const studentQuery = req.user.role === 'admin'
    ? { _id: student, role: 'student' }
    : { _id: student, role: 'student', teacher: req.user._id };
  const studentDoc = await User.findOne(studentQuery).select('name email').lean();
  if (!studentDoc) {
    res.status(404);
    throw new Error('Student not found among your students');
  }

  const liveClass = await LiveClass.create({
    teacher: req.user._id,
    student: studentDoc._id,
    title,
    startsAt: when,
    durationMin: durationMin || 30,
    meetingUrl: meetingUrl || '',
    notes: notes || '',
  });

  // Notify the student (guarded by SMTP; no-op if email isn't configured).
  await sendMail({
    to: studentDoc.email,
    subject: 'A live class has been scheduled — Al-Rahma Academy',
    html: liveClassScheduledEmail({
      studentName: studentDoc.name,
      teacherName: req.user.name,
      title,
      startsAt: when,
      meetingUrl,
    }),
  }).catch(() => {});

  const populated = await liveClass.populate(POPULATE);
  res.status(201).json(populated);
});

// Loads a class the caller is allowed to modify (own teacher, or admin).
async function ownClassOr404(req, res) {
  const filter = req.user.role === 'admin'
    ? { _id: req.params.id }
    : { _id: req.params.id, teacher: req.user._id };
  const liveClass = await LiveClass.findOne(filter);
  if (!liveClass) {
    res.status(404);
    throw new Error('Class not found');
  }
  return liveClass;
}

// @desc  Update / reschedule / cancel a class (teacher own, or admin).
// @route PATCH /api/classes/:id
// @access Private/Staff
export const updateClass = asyncHandler(async (req, res) => {
  const liveClass = await ownClassOr404(req, res);
  const { title, startsAt, durationMin, meetingUrl, notes, status } = req.body;

  if (title != null)       liveClass.title = title;
  if (durationMin != null) liveClass.durationMin = durationMin;
  if (meetingUrl != null)  liveClass.meetingUrl = meetingUrl;
  if (notes != null)       liveClass.notes = notes;
  if (status != null)      liveClass.status = status;
  if (startsAt != null) {
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) { res.status(400); throw new Error('startsAt is not a valid date'); }
    liveClass.startsAt = when;
  }

  await liveClass.save();
  const populated = await liveClass.populate(POPULATE);
  res.json(populated);
});

// @desc  Delete a class (teacher own, or admin).
// @route DELETE /api/classes/:id
// @access Private/Staff
export const deleteClass = asyncHandler(async (req, res) => {
  const liveClass = await ownClassOr404(req, res);
  await liveClass.deleteOne();
  res.json({ message: 'Class deleted', id: req.params.id });
});

// ── Real AdminUser-scoped variants (auth hardening security batch) ─────────
// These four back /api/v1/admin/live-classes (Mongo mode), behind
// verifyAccessToken + requirePermissions('live_classes:write') for the
// mutations — the hardened replacement for the legacy `staffOnly`
// (protect + User.role === 'admin' || 'teacher') mutation routes at
// /api/classes, whose only live frontend consumer was AdminClassesTab.jsx
// (the real, MFA-gated admin SPA calling through the plain `http` client,
// a genuine escalation gap). They do not depend on req.user at all — the
// caller here is a real AdminUser (req.adminUser), a separate model/
// collection with no natural regular-User "teacher" identity to attribute
// (see LiveClass.js's teacher field comment) — so an admin-scheduled class
// always lists every student, is always modifiable/deletable regardless of
// `teacher`, and is created with no teacher set.

// @route GET /api/v1/admin/live-classes
export const adminListClasses = asyncHandler(async (req, res) => {
  // Review follow-up: this used to res.json() a bare array, while the
  // Supabase-mode equivalent (data/supabase/admin/liveClassesAdminController.js)
  // already returned the standard { data, total, page, pages } envelope
  // every other /v1/admin/* list endpoint uses (see utils/pagination.js's
  // sendPaginated(), the same helper controllers/crudController.js's
  // generic list() calls) — Mongo was the one inconsistent with the rest of
  // this API, not the other way around. AdminClassesTab.jsx crashing under
  // DATA_BACKEND=supabase (classes.map is not a function, since it received
  // the envelope object instead of an array) is what this fixes; it also
  // adds real pagination to what was previously an unbounded find().
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  if (req.query.upcoming) {
    filter.startsAt = { $gte: new Date() };
    filter.status = { $ne: 'cancelled' };
  }

  const [data, total] = await Promise.all([
    LiveClass.find(filter).populate(POPULATE).sort('startsAt').skip(skip).limit(limit).lean(),
    LiveClass.countDocuments(filter),
  ]);

  sendPaginated(res, { data, total, page, limit });
});

// @route POST /api/v1/admin/live-classes
export const adminCreateClass = asyncHandler(async (req, res) => {
  const { student, title, startsAt, durationMin, meetingUrl, notes } = req.body;
  if (!student || !title || !startsAt) {
    res.status(400);
    throw new Error('student, title and startsAt are required');
  }
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) {
    res.status(400);
    throw new Error('startsAt is not a valid date');
  }

  const studentDoc = await User.findById(student).select('name email').lean();
  if (!studentDoc) {
    res.status(404);
    throw new Error('Student not found');
  }

  const liveClass = await LiveClass.create({
    teacher: null,
    student: studentDoc._id,
    title,
    startsAt: when,
    durationMin: durationMin || 30,
    meetingUrl: meetingUrl || '',
    notes: notes || '',
  });

  await sendMail({
    to: studentDoc.email,
    subject: 'A live class has been scheduled — Al-Rahma Academy',
    html: liveClassScheduledEmail({
      studentName: studentDoc.name,
      teacherName: 'AL-Rahma Academy',
      title,
      startsAt: when,
      meetingUrl,
    }),
  }).catch(() => {});

  const populated = await liveClass.populate(POPULATE);
  res.status(201).json(populated);
});

// @route PATCH /api/v1/admin/live-classes/:id
export const adminUpdateClass = asyncHandler(async (req, res) => {
  const liveClass = await LiveClass.findById(req.params.id);
  if (!liveClass) { res.status(404); throw new Error('Class not found'); }

  const { title, startsAt, durationMin, meetingUrl, notes, status } = req.body;
  if (title != null)       liveClass.title = title;
  if (durationMin != null) liveClass.durationMin = durationMin;
  if (meetingUrl != null)  liveClass.meetingUrl = meetingUrl;
  if (notes != null)       liveClass.notes = notes;
  if (status != null)      liveClass.status = status;
  if (startsAt != null) {
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) { res.status(400); throw new Error('startsAt is not a valid date'); }
    liveClass.startsAt = when;
  }

  await liveClass.save();
  const populated = await liveClass.populate(POPULATE);
  res.json(populated);
});

// @route DELETE /api/v1/admin/live-classes/:id
export const adminDeleteClass = asyncHandler(async (req, res) => {
  const liveClass = await LiveClass.findById(req.params.id);
  if (!liveClass) { res.status(404); throw new Error('Class not found'); }
  await liveClass.deleteOne();
  res.json({ message: 'Class deleted', id: req.params.id });
});
