import User from '../models/User.js';
import StudentRecord from '../models/StudentRecord.js';
import HifzProgress from '../models/HifzProgress.js';
import CourseProgress from '../models/CourseProgress.js';

// Build a course-progress report (same shape the admin report uses).
async function courseReport(studentId) {
  const rows = await CourseProgress.find({ user: studentId })
    .populate('course', 'title icon resources')
    .sort({ lastActivity: -1 });
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
    .select('-password');
  if (!student) {
    res.status(404);
    throw new Error('Student not found among your students');
  }
  return student;
}

// @desc  Teacher: list the students assigned to them, with a quick summary.
// @route GET /api/teacher/students
// @access Private/Teacher
export async function getMyStudents(req, res, next) {
  try {
    const students = await User.find({ teacher: req.user._id })
      .select('name email subscription createdAt')
      .sort('name');

    // Attach a lightweight record count + last activity per student.
    const summaries = await Promise.all(
      students.map(async (s) => {
        const [recordCount, lastRecord, hifz] = await Promise.all([
          StudentRecord.countDocuments({ student: s._id }),
          StudentRecord.findOne({ student: s._id }).sort('-date').select('date grade'),
          HifzProgress.find({ user: s._id }).select('memorizedVerses'),
        ]);
        const memorized = hifz.reduce((sum, h) => sum + (h.memorizedVerses?.length || 0), 0);
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          subscription: s.subscription,
          recordCount,
          lastRecordDate: lastRecord?.date || null,
          memorizedVerses: memorized,
        };
      })
    );
    res.json(summaries);
  } catch (err) {
    next(err);
  }
}

// @desc  Teacher: full profile of one of their students.
// @route GET /api/teacher/students/:id
// @access Private/Teacher
export async function getStudentDetail(req, res, next) {
  try {
    const student = await ownStudentOr404(req.user._id, req.params.id, res);
    const [records, hifz, courses] = await Promise.all([
      StudentRecord.find({ student: student._id })
        .populate('course', 'title icon')
        .sort('-date'),
      HifzProgress.find({ user: student._id }).sort({ chapterId: 1 }),
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
  } catch (err) {
    next(err);
  }
}

// @desc  Teacher: add a follow-up record for one of their students.
// @route POST /api/teacher/students/:id/records
// @body  { date?, course?, grade?, gradeLabel?, attendance?, note? }
// @access Private/Teacher
export async function addRecord(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

// @desc  Teacher: delete a record they created.
// @route DELETE /api/teacher/records/:recordId
// @access Private/Teacher
export async function deleteRecord(req, res, next) {
  try {
    const record = await StudentRecord.findOne({ _id: req.params.recordId, teacher: req.user._id });
    if (!record) { res.status(404); throw new Error('Record not found'); }
    await record.deleteOne();
    res.json({ message: 'Record deleted' });
  } catch (err) {
    next(err);
  }
}
