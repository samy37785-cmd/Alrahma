import LiveClass from '../models/LiveClass.js';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { liveClassScheduledEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
    const parent = await User.findById(req.user._id).select('children');
    filter = { student: { $in: parent?.children || [] } };
  } else {
    filter = { student: req.user._id };
  }

  if (req.query.upcoming) {
    filter.startsAt = { $gte: new Date() };
    filter.status = { $ne: 'cancelled' };
  }

  const classes = await LiveClass.find(filter).populate(POPULATE).sort('startsAt');
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
  const studentDoc = await User.findOne(studentQuery).select('name email');
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
