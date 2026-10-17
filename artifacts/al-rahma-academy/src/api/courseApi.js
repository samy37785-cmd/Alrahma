import http from './http';
import adminHttp from './adminHttp';

// --- Courses (public listing + admin CRUD) ---
export const getCourses    = ()         => http.get('/courses').then((r) => r.data);
export const getCourse     = (id)       => http.get(`/courses/${id}`).then((r) => r.data);
export const createCourse  = (data)     => adminHttp.post('/v1/admin/courses', data).then((r) => r.data);
export const updateCourse  = (id, data) => adminHttp.put(`/v1/admin/courses/${id}`, data).then((r) => r.data);
export const deleteCourse  = (id)       => adminHttp.delete(`/v1/admin/courses/${id}`).then((r) => r.data);

// --- Lesson progress ---
export const getCourseProgress    = (courseId)       => http.get(`/progress/${courseId}`).then((r) => r.data);
export const toggleLessonDone     = (courseId, data) => http.put(`/progress/${courseId}`, data).then((r) => r.data);
export const getUserCourseProgress = (userId)        => adminHttp.get(`/v1/admin/users/${userId}/progress`).then((r) => r.data);

// --- Hifz (memorisation) ---
export const getMyHifz       = ()                    => http.get('/hifz').then((r) => r.data);
export const markHifz        = (chapterId, data)     => http.put(`/hifz/${chapterId}`, data).then((r) => r.data);
export const getUserHifzReport = (userId)            => adminHttp.get(`/v1/admin/users/${userId}/hifz`).then((r) => r.data);

// --- Certificates (the student's own list stays on the public API; the admin
//     listing, issue and revoke use the MFA admin API, AR-04) ---
export const getMyCertificates = ()       => http.get('/certificates/mine').then((r) => r.data);
export const issueCertificate  = (data)   => adminHttp.post('/v1/admin/certificates', data).then((r) => r.data);
export const listCertificates  = (userId) =>
  adminHttp.get('/v1/admin/certificates', { params: userId ? { userId } : {} }).then((r) => r.data);
export const revokeCertificate = (id)     => adminHttp.delete(`/v1/admin/certificates/${id}`).then((r) => r.data);
