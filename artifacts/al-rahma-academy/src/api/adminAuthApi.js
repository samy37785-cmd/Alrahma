import http from './http';

// Auth for the hardened AdminUser + TOTP-MFA stack (/api/v1/admin/auth/*) —
// a separate session from the regular User login (see adminHttp.js).
export const adminLogin      = (credentials) => http.post('/v1/admin/auth/login', credentials).then((r) => r.data);
export const adminMfaSetup   = ()            => http.post('/v1/admin/auth/mfa/setup').then((r) => r.data);
export const adminMfaConfirm = (token)       => http.post('/v1/admin/auth/mfa/confirm', { token }).then((r) => r.data);
export const adminMfaVerify  = (token)       => http.post('/v1/admin/auth/mfa/verify', { token }).then((r) => r.data);
export const adminLogout     = ()            => http.post('/v1/admin/auth/logout').then((r) => r.data);

// Rotates the admin_at/admin_rt cookie pair via the httpOnly admin_rt cookie
// (path-scoped to this exact endpoint — see backend/utils/adminAuthTokens.js
// — so it's never sent on ordinary /v1/admin/* calls). Deliberately built on
// `http`, not `adminHttp`: `adminHttp`'s response interceptor is the one
// consumer of this function, and calling through the same instance whose
// interceptor triggers it would recurse. `http` has no such interceptor.
export const adminRefresh    = ()            => http.post('/v1/admin/auth/refresh').then((r) => r.data);
