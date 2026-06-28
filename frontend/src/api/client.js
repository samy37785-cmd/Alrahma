// Backwards-compatible barrel — all existing imports from 'api/client' still work.
// New code should import directly from the domain file (e.g. '../api/courseApi').
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
