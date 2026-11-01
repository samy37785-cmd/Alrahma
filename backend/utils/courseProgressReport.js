import CourseProgress from '../models/CourseProgress.js';

// A student's progress across their courses, as the parent and teacher
// dashboards show it. `completed` holds both flat resource ids and
// `lesson:<id>` keys for module lessons, so the total counts both, the same
// way progressController's report does. Counting resources only showed, for
// example, 350% for a finished course with 2 resources and 5 lessons, and
// 0% for a course made of lessons alone.
export async function courseReport(studentId) {
  const rows = await CourseProgress.find({ user: studentId })
    .populate('course', 'title icon resources modules')
    .sort({ lastActivity: -1 })
    .lean();
  return rows
    .filter((r) => r.course)
    .map((r) => {
      const lessonCount = (r.course.modules || []).reduce((n, m) => n + (m.lessons?.length || 0), 0);
      const total = (r.course.resources?.length || 0) + lessonCount;
      const done  = r.completed.length;
      return {
        courseId: r.course._id,
        title:    r.course.title,
        icon:     r.course.icon,
        total,
        done,
        percent:  total ? Math.min(100, Math.round((done / total) * 100)) : 0,
        lastActivity: r.lastActivity,
      };
    });
}
