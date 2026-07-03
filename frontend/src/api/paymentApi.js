import http from './http';

// --- Stripe / PayPal ---
export const startStripeSession   = (data)    => http.post('/payments/stripe', data).then((r) => r.data);
export const startPaypalPayment   = (data)    => http.post('/payments/paypal', data).then((r) => r.data);
export const capturePaypalPayment = (orderId) => http.post(`/payments/paypal/${orderId}/capture`).then((r) => r.data);

// --- Manual payment methods ---
export const getManualMethods    = ()         => http.get('/payments/manual-methods').then((r) => r.data);
export const submitManualPayment = (data)     => http.post('/payments/manual', data).then((r) => r.data);
export const getManualPayments   = ()         => http.get('/payments/manual').then((r) => r.data);
export const reviewManualPayment = (id, data) => http.patch(`/payments/manual/${id}`, data).then((r) => r.data);

// --- Invoices ---
export const getInvoices = () => http.get('/invoices').then((r) => r.data);

// --- Coupons ---
export const validateCoupon = (code) => http.post('/coupons/validate', { code }).then((r) => r.data);
