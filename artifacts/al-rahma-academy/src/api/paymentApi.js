import http from './http';
import adminHttp from './adminHttp';

// Booking-First Enrollment: the customer-facing checkout UI (CheckoutModal)
// that used to call startStripeSession/startPaypalPayment/capturePaypalPayment/
// getManualMethods/submitManualPayment/validateCoupon was removed — payment
// now happens off-site over WhatsApp, confirmed manually by admin. Those
// endpoints still exist server-side (legacy/deferred, see
// docs/current-project-status.md) so any previously-submitted manual
// payment can still be reviewed below; nothing left in this file calls them
// from the customer flow.

// --- Manual payment review (admin — hardened MFA-protected stack) ---
export const getManualPayments   = ()         => adminHttp.get('/v1/admin/payments/manual').then((r) => r.data);
export const reviewManualPayment = (id, data) => adminHttp.patch(`/v1/admin/payments/manual/${id}`, data).then((r) => r.data);

// --- Invoices (read-only billing history) ---
export const getInvoices = () => http.get('/invoices').then((r) => r.data);
