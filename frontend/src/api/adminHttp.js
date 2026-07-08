import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

function getCsrfToken() {
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='))
      ?.split('=')[1] ?? ''
  );
}

// Dedicated axios instance for the hardened /api/v1/admin/* API. Kept
// separate from api/http.js because a 401 here means a different thing: the
// short-lived (15 min) admin_at cookie expired, not the regular user's
// session — so it must send the visitor to /admin/login, never /login.
const adminHttp = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

adminHttp.interceptors.request.use((config) => {
  const mutating = ['post', 'put', 'patch', 'delete'];
  if (mutating.includes(config.method?.toLowerCase())) {
    config.headers['x-csrf-token'] = getCsrfToken();
  }
  return config;
});

// There is no proactive token-refresh loop here — a 401 (expired admin_at,
// 15 min lifetime) simply clears the cached profile and hard-redirects to
// the admin login screen. That's a heavier UX than a silent refresh, but
// simpler and safer for a security-sensitive admin console; the login
// endpoint's own routes are excluded so a failed login attempt doesn't
// trigger a redirect loop.
adminHttp.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/v1/admin/auth/')) {
      localStorage.removeItem('adminUser');
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.assign('/admin/login');
      }
    }
    return Promise.reject(err);
  }
);

export default adminHttp;
