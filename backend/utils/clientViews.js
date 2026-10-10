// Explicit allowlists for records returned to a student or the public.
//
// Enrollment and Review rows also carry admin-only fields (adminNote, and
// on enrollments the offline-payment bookkeeping an admin records). Those
// must never reach a student- or public-facing response, so these helpers
// copy ONLY the named fields instead of deleting known-bad ones: a column
// added to the model later stays hidden until someone deliberately lists it
// here. Used by both data backends (Mongo controllers and data/supabase/),
// so the two return the same client shape. Admin routes do not use these.

const pick = (source, fields) => {
  if (!source) return null;
  const out = {};
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
};

// GET /api/enrollments/mine — the student's own booking. Deliberately
// excluded (admin-only): adminNote, agreedAmount, currency,
// paymentMethodExternal, paidAt, renewalAt.
export const ENROLLMENT_CLIENT_FIELDS = Object.freeze([
  '_id', 'name', 'email', 'whatsapp', 'country', 'city', 'timezone', 'times',
  'subjects', 'lang', 'level', 'ageGroup', 'genderPref',
  'teacherId', 'teacherName', 'plan',
  'status', 'notes', 'bookingRef', 'createdAt', 'updatedAt',
]);

export const toClientEnrollment = (enrollment) => pick(enrollment, ENROLLMENT_CLIENT_FIELDS);

// Public review lists and the author's own POST /api/reviews response.
// Deliberately excluded: adminNote (moderation note) and Mongo's __v.
export const REVIEW_CLIENT_FIELDS = Object.freeze([
  '_id', 'student', 'teacher', 'course', 'rating', 'title', 'body',
  'status', 'helpful', 'createdAt', 'updatedAt',
]);

// `student` is either an id or a populated { _id, name } — never more.
export const toClientReview = (review) => {
  const out = pick(review, REVIEW_CLIENT_FIELDS);
  if (out && out.student && typeof out.student === 'object' && 'name' in out.student) {
    out.student = { _id: out.student._id, name: out.student.name };
  }
  return out;
};
