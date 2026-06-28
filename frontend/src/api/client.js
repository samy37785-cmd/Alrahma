import axios from 'axios';

// One shared axios instance for the whole app.
// In production (Vercel) the API is on the same domain → use relative /api.
// In local dev fall back to the Express server on port 5000.
const baseURL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

// Automatically attach the JWT token (if logged in) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// --- Public helpers ---
export const getCourses = () => api.get('/courses').then((r) => r.data);
export const submitTrial = (data) => api.post('/trials', data).then((r) => r.data);
export const registerUser = (data) => api.post('/auth/register', data).then((r) => r.data);
export const loginUser = (data) => api.post('/auth/login', data).then((r) => r.data);
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

// --- Admin helpers (require a valid admin token) ---
export const createCourse = (data) => api.post('/courses', data).then((r) => r.data);
export const updateCourse = (id, data) => api.put(`/courses/${id}`, data).then((r) => r.data);
export const deleteCourse = (id) => api.delete(`/courses/${id}`).then((r) => r.data);
export const getTrials = () => api.get('/trials').then((r) => r.data);
export const getUsers  = () => api.get('/auth/users').then((r) => r.data);
export const updateUserSubscription = (id, data) => api.patch(`/auth/users/${id}/subscription`, data).then((r) => r.data);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword  = (data)  => api.post('/auth/reset-password', data).then((r) => r.data);

// --- Enrollment wizard ---
export const submitEnrollment   = (data) => api.post('/enrollments', data).then((r) => r.data);
export const getMyEnrollment    = ()     => api.get('/enrollments/mine').then((r) => r.data);
export const getEnrollments     = ()     => api.get('/enrollments').then((r) => r.data);
export const updateEnrollment   = (id, data) => api.patch(`/enrollments/${id}`, data).then((r) => r.data);
