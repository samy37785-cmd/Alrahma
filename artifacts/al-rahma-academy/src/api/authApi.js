import http from './http';

export const registerUser   = (data)  => http.post('/auth/register', data).then((r) => r.data);
export const loginUser      = (data)  => http.post('/auth/login', data).then((r) => r.data);
export const logoutUser     = ()      => http.post('/auth/logout').then((r) => r.data);
export const getMe          = ()      => http.get('/auth/me').then((r) => r.data);
export const updateMe       = (data)  => http.put('/auth/me', data).then((r) => r.data);
export const forgotPassword = (email) => http.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword  = (data)  => http.post('/auth/reset-password', data).then((r) => r.data);
export const googleLogin    = (credential) => http.post('/auth/google', { credential }).then((r) => r.data);
// getMyLinkCode() (GET /auth/link-code) was removed in Stage 2C (see
// docs/legacy-role-orphan-cleanup.md) - it was the child/user-side half of
// the parent-child linking feature, whose only consumer, Profile.jsx's
// link-code card, was removed in the same change. The server-side endpoint
// itself is untouched/unverified either way - no Remote access in this task.