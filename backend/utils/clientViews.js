// Explicit allowlists for records returned to a student or the public.
//
// Enrollment and Review rows carry an admin-only moderation/booking note
// (adminNote) that must never reach a student- or public-facing response.
// These helpers copy ONLY the named fields instead of deleting known-bad
// ones, so a column added to the model later stays hidden until someone
// deliberately lists it here. The lists are every field the schema has
// (Mongo's __v included) except adminNote, so the client contract is the
// same as before apart from that one field. Used by both data backends
// (Mongo controllers and data/supabase/). Admin routes do not use these.

const pick = (source, fields) => {
  if (!source) return null;
  const out = {};
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
};

// GET /api/enrollments/mine — the student's own booking. Deliberately
// excluded: adminNote. The student's own payment details (agreedAmount,
// currency, paymentMethodExternal, paidAt, renewalAt) stay in the response,
// as they always were.
export const ENROLLMENT_CLIENT_FIELDS = Object.freeze([
  '_id', 'name', 'email', 'whatsapp', 'country', 'city', 'timezone', 'times',
  'subjects', 'lang', 'level', 'ageGroup', 'genderPref',
  'teacherId', 'teacherName', 'plan',
  'status', 'notes', 'bookingRef',
  'agreedAmount', 'currency', 'paymentMethodExternal', 'paidAt', 'renewalAt',
  'createdAt', 'updatedAt', '__v',
]);

export const toClientEnrollment = (enrollment) => pick(enrollment, ENROLLMENT_CLIENT_FIELDS);

// Public review lists and the author's own POST /api/reviews response.
// Deliberately excluded: adminNote (the moderator's note).
export const REVIEW_CLIENT_FIELDS = Object.freeze([
  '_id', 'student', 'teacher', 'course', 'rating', 'title', 'body',
  'status', 'helpful', 'createdAt', 'updatedAt', '__v',
]);

// `student` is either an id or a populated { _id, name } — never more.
export const toClientReview = (review) => {
  const out = pick(review, REVIEW_CLIENT_FIELDS);
  if (out && out.student && typeof out.student === 'object' && 'name' in out.student) {
    out.student = { _id: out.student._id, name: out.student.name };
  }
  return out;
};
