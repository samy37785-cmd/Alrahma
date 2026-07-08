import http from './http';

// Auth for the hardened AdminUser + TOTP-MFA stack (/api/v1/admin/auth/*) —
// a separate session from the regular User login (see adminHttp.js).
export const adminLogin      = (credentials) => http.post('/v1/admin/auth/login', credentials).then((r) => r.data);
export const adminMfaSetup   = ()            => http.post('/v1/admin/auth/mfa/setup').then((r) => r.data);
export const adminMfaConfirm = (token)       => http.post('/v1/admin/auth/mfa/confirm', { token }).then((r) => r.data);
export const adminMfaVerify  = (token)       => http.post('/v1/admin/auth/mfa/verify', { token }).then((r) => r.data);
export const adminLogout     = ()            => http.post('/v1/admin/auth/logout').then((r) => r.data);
