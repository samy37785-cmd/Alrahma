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
export * from './teacherApi';
export * from './parentApi';
export * from './blogApi';
export * from './searchApi';
export * from './reviewApi';
export * from './contentApi';
