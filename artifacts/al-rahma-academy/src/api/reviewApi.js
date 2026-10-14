import http from './http';
import adminHttp from './adminHttp';

// Student-facing (protect, regular User session)
export const getTeacherReviews = (teacherId, params) =>
  http.get(`/reviews/teacher/${teacherId}`, { params }).then((r) => r.data);
export const getCourseReviews = (courseId, params) =>
  http.get(`/reviews/course/${courseId}`, { params }).then((r) => r.data);
export const createReview = (data) => http.post('/reviews', data).then((r) => r.data);

// Admin list and moderation both live on the hardened /v1/admin MFA stack
// (GET /api/reviews never existed, so the old admin read always 404'd).
export const getAdminReviews = (params) => adminHttp.get('/v1/admin/reviews', { params }).then((r) => r.data);
export const moderateReview = (id, data) =>
  adminHttp.patch(`/v1/admin/reviews/${id}/moderate`, data).then((r) => r.data);
