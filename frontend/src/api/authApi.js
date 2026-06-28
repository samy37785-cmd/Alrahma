import http from './http';

export const registerUser   = (data)  => http.post('/auth/register', data).then((r) => r.data);
export const loginUser      = (data)  => http.post('/auth/login', data).then((r) => r.data);
export const logoutUser     = ()      => http.post('/auth/logout').then((r) => r.data);
export const getMe          = ()      => http.get('/auth/me').then((r) => r.data);
export const updateMe       = (data)  => http.put('/auth/me', data).then((r) => r.data);
export const forgotPassword = (email) => http.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword  = (data)  => http.post('/auth/reset-password', data).then((r) => r.data);
export const getMyLinkCode  = ()      => http.get('/auth/link-code').then((r) => r.data);
export const googleLogin    = (credential) => http.post('/auth/google', { credential }).then((r) => r.data);