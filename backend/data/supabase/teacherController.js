// DATA_BACKEND=supabase controller for student_records (the "teacher"
// domain). Mirrors controllers/teacherController.js's routes/response
// shapes, adapted for the same role-model difference documented in
// liveClassController.js: "being someone's teacher" is the
// profiles.teacher_id relationship (is_teacher_of()), not an account role —
// this route is mounted under `protect` only (no teacherOnly-equivalent),
// and RLS (student_records_*, 0015_new_domains_rls.sql) is the real
// authorization boundary. A caller with no students assigned to them simply
// gets empty results / 404s on every endpoint here, exactly as a genuine
// non-teacher account would under the Mongo path's teacherOnly gate.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

function recordToJson(row) {
  return {
    _id: row.id,
    student: row.student_id,
    teacher: row.teacher_id,
    course: row.course_id ? { _id: row.course_id, title: row.course_title, icon: row.course_icon } : null,
    date: row.record_date,
    grade: row.grade,
    gradeLabel: row.grade_label,
    attendance: row.attendance,
    memoFrom: row.memo_from,
    memoTo: row.memo_to,
    review: row.review,
    tajweed: row.tajweed,
    homework: row.homework,
    note: row.note,
    createdAt: row.created_at,
  };
}

async function courseReport(client, studentId) {
  const r = await client.query(
    `SELECT cp.completed, cp.last_activity, c.id AS course_id, c.title, c.icon, c.resources, c.modules
       FROM course_progress cp
       JOIN courses c ON c.id = cp.course_id
      WHERE cp.user_id = $1
      ORDER BY cp.last_activity DESC`,
    [studentId]
  );
  return r.rows.map((row) => {
    const lessonCount = (row.modules || []).reduce((n, m) => n + (m.lessons?.length || 0), 0);
    const total = (row.resources?.length || 0) + lessonCount;
    const done = (row.completed || []).length;
    return {
      courseId: row.course_id,
      title: row.title,
      icon: row.icon,
      total,
      done,
      percent: total ? Math.round((done / total) * 100) : 0,
      lastActivity: row.last_activity,
    };
  });
}

// @route GET /api/teacher/students
// @access Private (must have students assigned via profiles.teacher_id)
export const getMyStudents = asyncHandler(async (req, res) => {
  const summaries = await withUserContext(req.user._id, async (client) => {
    const studentsRes = await client.query(
      `SELECT id, name, email, created_at FROM profiles WHERE teacher_id = $1 ORDER BY name`,
      [req.user._id]
    );
    const students = studentsRes.rows;
    if (students.length === 0) return [];
    const ids = students.map((s) => s.id);

    const [recordStats, hifzStats] = await Promise.all([
      client.query(
        `SELECT student_id, count(*)::int AS record_count, max(record_date) AS last_record_date
           FROM student_records WHERE student_id = ANY($1) GROUP BY student_id`,
        [ids]
      ),
      client.query(
        `SELECT user_id, coalesce(sum(jsonb_array_length(memorized_verses)), 0)::int AS memorized
           FROM hifz_progress WHERE user_id = ANY($1) GROUP BY user_id`,
        [ids]
      ),
    ]);
    const recordById = new Map(recordStats.rows.map((r) => [r.student_id, r]));
    const memorizedById = new Map(hifzStats.rows.map((r) => [r.user_id, r.memorized]));

    return students.map((s) => ({
      _id: s.id,
      name: s.name,
      email: s.email,
      recordCount: recordById.get(s.id)?.record_count || 0,
      lastRecordDate: recordById.get(s.id)?.last_record_date || null,
      memorizedVerses: memorizedById.get(s.id) || 0,
    }));
  });
  res.json(summaries);
});

// @route GET /api/teacher/students/:id
// @access Private (own student)
export const getStudentDetail = asyncHandler(async (req, res) => {
  const result = await withUserContext(req.user._id, async (client) => {
    const studentRes = await client.query(
      `SELECT id, name, email FROM profiles WHERE id = $1 AND teacher_id = $2`,
      [req.params.id, req.user._id]
    );
    const student = studentRes.rows[0];
    if (!student) return null;

    const [recordsRes, hifzRes, courses] = await Promise.all([
      client.query(
        `SELECT sr.*, c.title AS course_title, c.icon AS course_icon FROM student_records sr
           LEFT JOIN courses c ON c.id = sr.course_id
          WHERE sr.student_id = $1
          ORDER BY sr.record_date DESC`,
        [student.id]
      ),
      client.query('SELECT * FROM hifz_progress WHERE user_id = $1 ORDER BY chapter_id', [student.id]),
      courseReport(client, student.id),
    ]);

    return {
      student: { _id: student.id, name: student.name, email: student.email },
      records: recordsRes.rows.map(recordToJson),
      hifz: hifzRes.rows,
      courses,
    };
  });

  if (!result) {
    res.status(404);
    throw new Error('Student not found among your students');
  }
  res.json(result);
});

// @route POST /api/teacher/students/:id/records
// @access Private (own student)
export const addRecord = asyncHandler(async (req, res) => {
  const { date, course, grade, gradeLabel, attendance, note, memoFrom, memoTo, review, tajweed, homework } = req.body;

  if (grade == null && !gradeLabel && !attendance && !note?.trim() && !memoFrom && !memoTo && !review && !tajweed && !homework) {
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

  try {
    const row = await withUserContext(req.user._id, async (client) => {
      const studentRes = await client.query(
        'SELECT id FROM profiles WHERE id = $1 AND teacher_id = $2',
        [req.params.id, req.user._id]
      );
      if (!studentRes.rows[0]) {
        const err = new Error('Student not found among your students');
        err.status = 404;
        throw err;
      }

      const r = await client.query(
        `INSERT INTO student_records
           (student_id, teacher_id, course_id, record_date, grade, grade_label, attendance,
            memo_from, memo_to, review, tajweed, homework, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          req.params.id, req.user._id, course || null, date ? new Date(date) : new Date(),
          gradeNum, gradeLabel || null, attendance || 'unmarked',
          memoFrom || null, memoTo || null, review || null, tajweed || null, homework || null, note || null,
        ]
      );
      return r.rows[0];
    });
    res.status(201).json(recordToJson(row));
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    throw err;
  }
});

// @route DELETE /api/teacher/records/:recordId
// @access Private (own record)
export const deleteRecord = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'DELETE FROM student_records WHERE id = $1 AND teacher_id = $2 RETURNING id',
      [req.params.recordId, req.user._id]
    );
    return r.rows[0];
  });
  if (!row) {
    res.status(404);
    throw new Error('Record not found');
  }
  res.json({ message: 'Record deleted' });
});
