import axios from 'axios';

// One shared axios instance for the whole app.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
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

// --- Payments ---
// PayMob: returns { type: 'iframe' | 'redirect', url, orderId }
export const startPaymobPayment = (data) =>
  api.post('/payments/paymob', data).then((r) => r.data);
// PayPal: returns { type: 'redirect', url, orderId } (approval link)
export const startPaypalPayment = (data) =>
  api.post('/payments/paypal', data).then((r) => r.data);
export const capturePaypalPayment = (orderId) =>
  api.post(`/payments/paypal/${orderId}/capture`).then((r) => r.data);

// --- Admin helpers (require a valid admin token) ---
export const createCourse = (data) => api.post('/courses', data).then((r) => r.data);
export const deleteCourse = (id) => api.delete(`/courses/${id}`).then((r) => r.data);
export const getTrials = () => api.get('/trials').then((r) => r.data);
