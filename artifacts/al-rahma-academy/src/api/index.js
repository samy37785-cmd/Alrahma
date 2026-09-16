// Primary entry point for the API layer.
// Import domain modules directly for the best tree-shaking,
// or use this barrel when you need several domains at once.
export { default } from './http';

export * from './authApi';
export * from './adminApi';
export * from './courseApi';
export * from './enrollmentApi';
// paymentApi.js was removed — it only ever called the online card-gateway
// checkout routes (Stripe/PayPal), which are the one thing still cancelled
// (see docs/current-project-status.md); there is nothing left for it to
// call. Manual/offline payment, coupons, and invoices are live again but
// have no checkout-style frontend module of their own to restore.
export * from './classApi';
export * from './messageApi';
export * from './notificationApi';
export * from './wishlistApi';
// teacherApi.js and parentApi.js were removed in Stage 2C (see
// docs/legacy-role-orphan-cleanup.md) - the legacy teacher/parent account
// APIs they backed have no product concept left to serve.
export * from './blogApi';
export * from './searchApi';
export * from './contentApi';
