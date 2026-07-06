import User from '../models/User.js';
import StudentRecord from '../models/StudentRecord.js';
import HifzProgress from '../models/HifzProgress.js';
import CourseProgress from '../models/CourseProgress.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Build a course-progress report (same shape the admin report uses).
async function courseReport(studentId) {
  const rows = await CourseProgress.find({ user: studentId })
    .populate('course', 'title icon resources')
    .sort({ lastActivity: -1 })
    .lean();
  return rows
    .filter((r) => r.course)
    .map((r) => {
      const total = r.course.resources?.length || 0;
      const done  = r.completed.length;
      return {
        courseId: r.course._id,
        title:    r.course.title,
        icon:     r.course.icon,
        total,
        done,
        percent:  total ? Math.round((done / total) * 100) : 0,
        lastActivity: r.lastActivity,
      };
    });
}

// Verify the given student is actually assigned to this teacher.
async function ownStudentOr404(teacherId, studentId, res) {
  const student = await User.findOne({ _id: studentId, teacher: teacherId })
    .select('-password')
    .lean();
  if (!student) {
    res.status(404);
    throw new Error('Student not found among your students');
  }
  return student;
}

// @desc  Teacher: list the students assigned to them, with a quick summary.
// @route GET /api/teacher/students
// @access Private/Teacher
export const getMyStudents = asyncHandler(async (req, res) => {
  const students = await User.find({ teacher: req.user._id })
    .select('name email subscription createdAt')
    .sort('name')
    .lean();

  const studentIds = students.map((s) => s._id);

  // Two batched aggregations (a constant 2 queries, independent of student
  // count) replace what was previously 3 queries PER student
  // (StudentRecord.countDocuments + StudentRecord.findOne + HifzProgress.find)
  // — see T4 audit. Both $match stages hit an existing index
  // (StudentRecord: { student: 1, date: -1 }; HifzProgress: { user: 1,
  // chapterId: 1 }, used here on its prefix field), so no new index is
  // needed.
  //
  // T6: the StudentRecord pipeline's early $project (restricted to the two
  // fields $group actually needs) lets MongoDB answer the whole query from
  // the { student: 1, date: -1 } index alone — confirmed via explain():
  // totalDocsExamined drops from 100 to 0 for a 20-student/5-records-each
  // fixture (PROJECTION_COVERED instead of FETCH). The same trick does NOT
  // help the HifzProgress pipeline below — memorizedVerses isn't part of its
  // { user: 1, chapterId: 1 } index, so MongoDB must fetch the full document
  // regardless (confirmed via explain(): totalDocsExamined unchanged either
  // way) — left as-is per "only optimize where there is measurable benefit."
  const [recordStats, hifzStats] = await Promise.all([
    StudentRecord.aggregate([
      { $match: { student: { $in: studentIds } } },
      { $project: { _id: 0, student: 1, date: 1 } },
      { $sort: { date: -1 } },
      { $group: { _id: '$student', recordCount: { $sum: 1 }, lastRecordDate: { $first: '$date' } } },
    ]),
    HifzProgress.aggregate([
      { $match: { user: { $in: studentIds } } },
      { $group: { _id: '$user', memorizedVerses: { $sum: { $size: { $ifNull: ['$memorizedVerses', []] } } } } },
    ]),
  ]);

  const recordStatsById = new Map(recordStats.map((r) => [String(r._id), r]));
  const memorizedById = new Map(hifzStats.map((h) => [String(h._id), h.memorizedVerses]));

  const summaries = students.map((s) => {
    const stats = recordStatsById.get(String(s._id));
    return {
      _id: s._id,
      name: s.name,
      email: s.email,
      subscription: s.subscription,
      recordCount: stats?.recordCount || 0,
      lastRecordDate: stats?.lastRecordDate || null,
      memorizedVerses: memorizedById.get(String(s._id)) || 0,
    };
  });
  res.json(summaries);
});

// @desc  Teacher: full profile of one of their students.
// @route GET /api/teacher/students/:id
// @access Private/Teacher
export const getStudentDetail = asyncHandler(async (req, res) => {
  const student = await ownStudentOr404(req.user._id, req.params.id, res);
  const [records, hifz, courses] = await Promise.all([
    StudentRecord.find({ student: student._id })
      .populate('course', 'title icon')
      .sort('-date')
      .lean(),
    HifzProgress.find({ user: student._id }).sort({ chapterId: 1 }).lean(),
    courseReport(student._id),
  ]);
  res.json({
    student: {
      _id: student._id,
      name: student.name,
      email: student.email,
      subscription: student.subscription,
    },
    records,
    hifz,
    courses,
  });
});

// @desc  Teacher: add a follow-up record for one of their students.
// @route POST /api/teacher/students/:id/records
// @body  { date?, course?, grade?, gradeLabel?, attendance?, note? }
// @access Private/Teacher
export const addRecord = asyncHandler(async (req, res) => {
  const student = await ownStudentOr404(req.user._id, req.params.id, res);

  const { date, course, grade, gradeLabel, attendance, note,
          memoFrom, memoTo, review, tajweed, homework } = req.body;

  // Need at least one meaningful field.
  if (grade == null && !gradeLabel && !attendance && !note?.trim() &&
      !memoFrom && !memoTo && !review && !tajweed && !homework) {
    res.status(400);
    throw new Error('Add at least a grade, attendance or note');
  }

  let gradeNum = null;
  if (grade != null && grade !== '') {
    gradeNum = Number(grade);
    if (Number.isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
      res.status(400);
      throw new Error('Grade must be a number between 0 and 100');
    }
  }

  const record = await StudentRecord.create({
    student:    student._id,
    teacher:    req.user._id,
    course:     course || null,
    date:       date ? new Date(date) : new Date(),
    grade:      gradeNum,
    gradeLabel: gradeLabel || '',
    attendance: attendance || '',
    memoFrom:   memoFrom || '',
    memoTo:     memoTo || '',
    review:     review || '',
    tajweed:    tajweed || '',
    homework:   homework || '',
    note:       note || '',
  });
  const populated = await record.populate('course', 'title icon');
  res.status(201).json(populated);
});

// @desc  Teacher: delete a record they created.
// @route DELETE /api/teacher/records/:recordId
// @access Private/Teacher
export const deleteRecord = asyncHandler(async (req, res) => {
  const record = await StudentRecord.findOne({ _id: req.params.recordId, teacher: req.user._id });
  if (!record) { res.status(404); throw new Error('Record not found'); }
  await record.deleteOne();
  res.json({ message: 'Record deleted' });
});
