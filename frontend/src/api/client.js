import axios from 'axios';

// One shared axios instance for the whole app.
// The API always lives at /api on the same origin — in production (Vercel
// all-in-one) directly, and in dev through the Vite proxy (see vite.config.js).
// Keeping it same-origin is what lets the httpOnly auth cookie work everywhere.
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send/receive the httpOnly auth cookie
});

export default api;

// --- Public helpers ---
export const getCourses = () => api.get('/courses').then((r) => r.data);
export const submitTrial = (data) => api.post('/trials', data).then((r) => r.data);
export const registerUser = (data) => api.post('/auth/register', data).then((r) => r.data);
export const loginUser = (data) => api.post('/auth/login', data).then((r) => r.data);
export const logoutUser = () => api.post('/auth/logout').then((r) => r.data);
export const getMe = () => api.get('/auth/me').then((r) => r.data);
export const updateMe = (data) => api.put('/auth/me', data).then((r) => r.data);

// --- Payments ---
// Stripe: returns { type: 'redirect', url, sessionId } — browser redirects to Stripe Checkout
export const startStripeSession = (data) =>
  api.post('/payments/stripe', data).then((r) => r.data);
// PayPal: returns { type: 'redirect', url, orderId } (approval link)
export const startPaypalPayment = (data) =>
  api.post('/payments/paypal', data).then((r) => r.data);
export const capturePaypalPayment = (orderId) =>
  api.post(`/payments/paypal/${orderId}/capture`).then((r) => r.data);

// --- Manual payment methods ---
export const getManualMethods   = ()       => api.get('/payments/manual-methods').then((r) => r.data);
export const submitManualPayment = (data)  => api.post('/payments/manual', data).then((r) => r.data);
export const getManualPayments  = ()       => api.get('/payments/manual').then((r) => r.data);
export const reviewManualPayment = (id, data) => api.patch(`/payments/manual/${id}`, data).then((r) => r.data);

// --- Invoices (require login) ---
export const getInvoices = () => api.get('/invoices').then((r) => r.data);

// --- Hifz (Qur'an memorization) progress (require login) ---
export const getMyHifz = () => api.get('/hifz').then((r) => r.data);
export const markHifz  = (chapterId, data) =>
  api.put(`/hifz/${chapterId}`, data).then((r) => r.data);

// --- Course progress / lesson completion (require login) ---
export const getCourseProgress = (courseId) =>
  api.get(`/progress/${courseId}`).then((r) => r.data);
export const toggleLessonDone  = (courseId, data) =>
  api.put(`/progress/${courseId}`, data).then((r) => r.data);

// --- Admin: a student's progress reports ---
export const getUserHifzReport     = (userId) => api.get(`/hifz/user/${userId}`).then((r) => r.data);
export const getUserCourseProgress = (userId) => api.get(`/progress/user/${userId}`).then((r) => r.data);

// --- Certificates ---
export const getMyCertificates  = ()        => api.get('/certificates/mine').then((r) => r.data);
export const issueCertificate   = (data)    => api.post('/certificates', data).then((r) => r.data);
export const listCertificates   = (userId)  => api.get('/certificates', { params: userId ? { userId } : {} }).then((r) => r.data);
export const revokeCertificate  = (id)      => api.delete(`/certificates/${id}`).then((r) => r.data);

// --- Newsletter ---
export const subscribeNewsletter = (email) => api.post('/newsletter', { email }).then((r) => r.data);

// --- Student: parent-link code ---
export const getMyLinkCode = () => api.get('/auth/link-code').then((r) => r.data);

// --- Teacher portal ---
export const getMyStudents     = ()           => api.get('/teacher/students').then((r) => r.data);
export const getStudentDetail  = (id)         => api.get(`/teacher/students/${id}`).then((r) => r.data);
export const addStudentRecord  = (id, data)   => api.post(`/teacher/students/${id}/records`, data).then((r) => r.data);
export const deleteStudentRecord = (recordId) => api.delete(`/teacher/records/${recordId}`).then((r) => r.data);

// --- Parent portal ---
export const linkChild       = (code) => api.post('/parent/link', { code }).then((r) => r.data);
export const getMyChildren   = ()     => api.get('/parent/children').then((r) => r.data);
export const getChildDetail  = (id)   => api.get(`/parent/children/${id}`).then((r) => r.data);
export const unlinkChild     = (id)   => api.delete(`/parent/children/${id}`).then((r) => r.data);

// --- Admin: teacher/parent management ---
export const listTeachers    = ()          => api.get('/auth/teachers').then((r) => r.data);
export const adminCreateUser = (data)      => api.post('/auth/users', data).then((r) => r.data);
export const updateUserRole  = (id, role)  => api.patch(`/auth/users/${id}/role`, { role }).then((r) => r.data);
export const assignTeacher   = (id, teacherId) => api.patch(`/auth/users/${id}/teacher`, { teacherId }).then((r) => r.data);
export const setFamilyName   = (id, familyName) => api.patch(`/auth/users/${id}/family`, { familyName }).then((r) => r.data);

// --- Admin helpers (require a valid admin token) ---
export const createCourse = (data) => api.post('/courses', data).then((r) => r.data);
export const updateCourse = (id, data) => api.put(`/courses/${id}`, data).then((r) => r.data);
export const deleteCourse = (id) => api.delete(`/courses/${id}`).then((r) => r.data);
export const getTrials = () => api.get('/trials').then((r) => r.data);
export const getUsers  = () => api.get('/auth/users').then((r) => r.data);
export const updateUserSubscription = (id, data) => api.patch(`/auth/users/${id}/subscription`, data).then((r) => r.data);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword  = (data)  => api.post('/auth/reset-password', data).then((r) => r.data);

// --- Live classes (role-aware listing; staff create/update/delete) ---
export const getClasses    = (params) => api.get('/classes', { params }).then((r) => r.data);
export const createClass    = (data)     => api.post('/classes', data).then((r) => r.data);
export const updateClass    = (id, data) => api.patch(`/classes/${id}`, data).then((r) => r.data);
export const deleteClass    = (id)       => api.delete(`/classes/${id}`).then((r) => r.data);

// --- Messaging (student ↔ their teacher) ---
export const getContacts     = ()           => api.get('/messages/contacts').then((r) => r.data);
export const getConversation = (userId)      => api.get(`/messages/${userId}`).then((r) => r.data);
export const sendMessage      = (data)        => api.post('/messages', data).then((r) => r.data);
export const getUnreadCount   = ()            => api.get('/messages/unread/count').then((r) => r.data);

// --- Enrollment wizard ---
export const submitEnrollment   = (data) => api.post('/enrollments', data).then((r) => r.data);
export const getMyEnrollment    = ()     => api.get('/enrollments/mine').then((r) => r.data);
export const getEnrollments     = ()     => api.get('/enrollments').then((r) => r.data);
export const updateEnrollment   = (id, data) => api.patch(`/enrollments/${id}`, data).then((r) => r.data);
