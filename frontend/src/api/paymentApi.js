import http from './http';
import adminHttp from './adminHttp';

// --- Stripe / PayPal ---
export const startStripeSession   = (data)    => http.post('/payments/stripe', data).then((r) => r.data);
export const startPaypalPayment   = (data)    => http.post('/payments/paypal', data).then((r) => r.data);
export const capturePaypalPayment = (orderId) => http.post(`/payments/paypal/${orderId}/capture`).then((r) => r.data);

// --- Manual payment methods (public) ---
export const getManualMethods    = ()         => http.get('/payments/manual-methods').then((r) => r.data);
export const submitManualPayment = (data)     => http.post('/payments/manual', data).then((r) => r.data);

// --- Manual payment review (admin — hardened MFA-protected stack) ---
export const getManualPayments   = ()         => adminHttp.get('/v1/admin/payments/manual').then((r) => r.data);
export const reviewManualPayment = (id, data) => adminHttp.patch(`/v1/admin/payments/manual/${id}`, data).then((r) => r.data);

// --- Invoices ---
export const getInvoices = () => http.get('/invoices').then((r) => r.data);

// --- Coupons ---
export const validateCoupon = (code) => http.post('/coupons/validate', { code }).then((r) => r.data);
