import http from './http';
import adminHttp from './adminHttp';

export const subscribeNewsletter = (email) => http.post('/newsletter', { email }).then((r) => r.data);
export const submitContactForm   = (data)  => http.post('/contact', data).then((r) => r.data);
export const submitTrial         = (data)  => http.post('/trials', data).then((r) => r.data);
// Auth hardening security batch: these two admin reads used to go through
// the plain `http` client (the legacy protect+adminOnly stack) — reachable
// with nothing but a regular User session whose `role` field said 'admin'.
// AdminDashboard.jsx (the real, MFA-gated admin SPA) is their only
// consumer, so they now go through `adminHttp` against the hardened admin
// API instead, exactly like every other AdminDashboard.jsx data call.
export const getSubscribers      = ()      => adminHttp.get('/v1/admin/subscribers').then((r) => r.data);
export const getTrials           = ()      => adminHttp.get('/v1/admin/trials').then((r) => r.data);
