// Primary entry point for the API layer.
// Import domain modules directly for the best tree-shaking,
// or use this barrel when you need several domains at once.
export { default } from './http';

export * from './authApi';
export * from './adminApi';
export * from './courseApi';
export * from './enrollmentApi';
export * from './paymentApi';
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
