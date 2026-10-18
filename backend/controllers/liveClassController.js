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
//        teacher = theirs, student = their own, parent = children's.
//        A regular account with role 'admin' used to get every class (with
//        every student's and teacher's name and email) on a password alone
//        (AR-04); it is now treated like any other account.
// @route GET /api/classes  (optional ?upcoming=1 to hide past/cancelled)
// @access Private
export const listClasses = asyncHandler(async (req, res) => {
  const role = req.user.role;
  let filter;
  if (role === 'teacher') {
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

// @desc  Schedule a live class for one of the teacher's own assigned students.
// @route POST /api/classes
// @access Private/Teacher
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
  const studentDoc = await User.findOne({ _id: student, role: 'student', teacher: req.user._id }).select('name email').lean();
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

// Loads a class the calling teacher gives.
async function ownClassOr404(req, res) {
  const liveClass = await LiveClass.findOne({ _id: req.params.id, teacher: req.user._id });
  if (!liveClass) {
    res.status(404);
    throw new Error('Class not found');
  }
  return liveClass;
}

// @desc  Update / reschedule / cancel one of the teacher's own classes.
// @route PATCH /api/classes/:id
// @access Private/Teacher
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

// @desc  Delete one of the teacher's own classes.
// @route DELETE /api/classes/:id
// @access Private/Teacher
export const deleteClass = asyncHandler(async (req, res) => {
  const liveClass = await ownClassOr404(req, res);
  await liveClass.deleteOne();
  res.json({ message: 'Class deleted', id: req.params.id });
});
