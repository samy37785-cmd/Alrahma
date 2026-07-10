import http from './http';
import adminHttp from './adminHttp';

// Student-facing (protect, regular User session)
export const getTeacherReviews = (teacherId, params) =>
  http.get(`/reviews/teacher/${teacherId}`, { params }).then((r) => r.data);
export const getCourseReviews = (courseId, params) =>
  http.get(`/reviews/course/${courseId}`, { params }).then((r) => r.data);
export const createReview = (data) => http.post('/reviews', data).then((r) => r.data);

// Admin reads stay on the legacy protect+adminOnly router (same convention as
// coupons/contact/certificates); only the moderation mutation lives on the
// hardened /v1/admin MFA stack.
export const getAdminReviews = (params) => http.get('/reviews', { params }).then((r) => r.data);
export const moderateReview = (id, data) =>
  adminHttp.patch(`/v1/admin/reviews/${id}/moderate`, data).then((r) => r.data);
