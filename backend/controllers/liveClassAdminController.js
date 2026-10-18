import LiveClass from '../models/LiveClass.js';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { liveClassScheduledEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';
import { auditFromReq } from '../services/auditService.js';

// The admin console's Classes tab (/api/v1/admin/live-classes): every class,
// behind the admin router's IP allowlist, TOTP MFA session and RBAC. It used
// to run on GET/POST/PATCH/DELETE /api/classes for any regular account with
// role 'admin' (a password alone). That route is now for the teacher, the
// student and the parent only (controllers/liveClassController.js).

const POPULATE = [
  { path: 'teacher', select: 'name email' },
  { path: 'student', select: 'name email' },
];

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const isObjectId = (value) => typeof value === 'string' && OBJECT_ID.test(value);

// Fields an admin may change on an existing class. Who teaches it and who it
// is for are fixed at creation: moving a class to another student or teacher
// is a delete and a new class, so neither side loses track of it silently.
const UPDATABLE = ['title', 'durationMin', 'meetingUrl', 'notes', 'status'];

// @desc  Every live class, soonest first (?upcoming=1 hides past and cancelled ones).
// @route GET /api/v1/admin/live-classes
// @access Admin API (users:read: the list names students and teachers)
export const adminListClasses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 200, maxLimit: 500 });
  const filter = {};
  if (req.query.upcoming) {
    filter.startsAt = { $gte: new Date() };
    filter.status = { $ne: 'cancelled' };
  }
  const [data, total] = await Promise.all([
    LiveClass.find(filter).populate(POPULATE).sort('startsAt').skip(skip).limit(limit).lean(),
    LiveClass.countDocuments(filter),
  ]);
  return sendPaginated(res, { data, total, page, limit });
});

// @desc  Schedule a class for a student with a chosen teacher. The teacher is
//        required and must be an existing teacher account: the class is never
//        recorded under the admin, and the student's assigned teacher is not
//        changed.
// @route POST /api/v1/admin/live-classes
// @access Admin API (live_classes:write)
export const adminCreateClass = asyncHandler(async (req, res) => {
  const { teacher, student, title, startsAt, durationMin, meetingUrl, notes } = req.body;

  if (!teacher) {
    return res.status(400).json({ message: 'Choose the teacher who will give this class' });
  }
  if (!student || !title || !String(title).trim() || !startsAt) {
    return res.status(400).json({ message: 'student, title and startsAt are required' });
  }
  if (!isObjectId(teacher)) {
    return res.status(400).json({ message: 'The selected teacher is not a valid teacher account' });
  }
  if (!isObjectId(student)) {
    return res.status(400).json({ message: 'The selected participant is not a valid student account' });
  }
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ message: 'startsAt is not a valid date' });
  }

  const [teacherDoc, studentDoc] = await Promise.all([
    User.findOne({ _id: teacher, role: 'teacher' }).select('name email').lean(),
    User.findOne({ _id: student, role: 'student' }).select('name email').lean(),
  ]);
  if (!teacherDoc) {
    return res.status(400).json({ message: 'The selected teacher is not a valid teacher account' });
  }
  if (!studentDoc) {
    return res.status(400).json({ message: 'The selected participant is not a valid student account' });
  }

  const liveClass = await LiveClass.create({
    teacher: teacherDoc._id,
    student: studentDoc._id,
    title: String(title).trim(),
    startsAt: when,
    durationMin: durationMin || 30,
    meetingUrl: meetingUrl || '',
    notes: notes || '',
  });

  // Same notice a teacher-scheduled class sends, naming the class's teacher.
  // sendMail never throws (config/mailer.js); the catch is belt and braces.
  await sendMail({
    to: studentDoc.email,
    subject: 'A live class has been scheduled — Al-Rahma Academy',
    html: liveClassScheduledEmail({
      studentName: studentDoc.name,
      teacherName: teacherDoc.name,
      title: liveClass.title,
      startsAt: when,
      meetingUrl,
    }),
  }).catch(() => {});

  await auditFromReq(req, 'liveClass.create', 'LiveClass', liveClass._id, null, liveClass, 'info');
  const populated = await liveClass.populate(POPULATE);
  res.status(201).json(populated);
});

async function classOr404(req, res) {
  const liveClass = isObjectId(req.params.id) ? await LiveClass.findById(req.params.id) : null;
  if (!liveClass) res.status(404).json({ message: 'Class not found' });
  return liveClass;
}

// @desc  Reschedule, cancel or edit any class.
// @route PATCH /api/v1/admin/live-classes/:id
// @access Admin API (live_classes:write)
export const adminUpdateClass = asyncHandler(async (req, res) => {
  const liveClass = await classOr404(req, res);
  if (!liveClass) return;
  const before = liveClass.toObject();

  for (const key of UPDATABLE) {
    if (req.body[key] != null) liveClass[key] = req.body[key];
  }
  if (req.body.startsAt != null) {
    const when = new Date(req.body.startsAt);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ message: 'startsAt is not a valid date' });
    }
    liveClass.startsAt = when;
  }

  await liveClass.save();
  await auditFromReq(req, 'liveClass.update', 'LiveClass', liveClass._id, before, liveClass, 'info');
  const populated = await liveClass.populate(POPULATE);
  res.json(populated);
});

// @desc  Delete any class.
// @route DELETE /api/v1/admin/live-classes/:id
// @access Admin API (live_classes:write)
export const adminDeleteClass = asyncHandler(async (req, res) => {
  const liveClass = await classOr404(req, res);
  if (!liveClass) return;
  await liveClass.deleteOne();
  await auditFromReq(req, 'liveClass.delete', 'LiveClass', liveClass._id, liveClass, null, 'warning');
  res.json({ message: 'Class deleted', id: req.params.id });
});
