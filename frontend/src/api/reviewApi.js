import http from './http';

export const getTeacherReviews = (teacherId, params) =>
  http.get(`/reviews/teacher/${teacherId}`, { params }).then((r) => r.data);
export const getCourseReviews  = (courseId, params)  =>
  http.get(`/reviews/course/${courseId}`, { params }).then((r) => r.data);
export const submitReview      = (data)               => http.post('/reviews', data).then((r) => r.data);
