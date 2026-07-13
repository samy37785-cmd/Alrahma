import axios from 'axios';
import { adminRefresh } from './adminAuthApi';
import { getCsrfToken, ensureCsrfToken } from './csrf';

const baseURL = import.meta.env.VITE_API_URL || '/api';

// Dedicated axios instance for the hardened /api/v1/admin/* API. Kept
// separate from api/http.js because a 401 here means a different thing: the
// short-lived (15 min) admin_at cookie expired, not the regular user's
// session — so it must attempt a refresh (below) before ever redirecting to
// /login, and would redirect to /admin/login, never /login, if it does.
const adminHttp = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

adminHttp.interceptors.request.use(async (config) => {
  const mutating = ['post', 'put', 'patch', 'delete'];
  if (mutating.includes(config.method?.toLowerCase())) {
    await ensureCsrfToken();
    config.headers['x-csrf-token'] = getCsrfToken();
  }
  return config;
});

function isAuthEndpoint(url) {
  return url?.includes('/v1/admin/auth/');
}

function clearSessionAndRedirect() {
  localStorage.removeItem('adminUser');
  if (!window.location.pathname.startsWith('/admin/login')) {
    window.location.assign('/admin/login');
  }
}

// Single-flight refresh: every 401 that arrives while a refresh is already
// in progress awaits this SAME promise instead of firing its own refresh
// call. The backend rotates admin_rt on every use (one-time), so two
// concurrent refresh calls would race — the second would fail with
// TOKEN_REUSE and revoke the whole session. Sharing one in-flight promise is
// both the queuing mechanism (later 401s just await it) and the concurrency
// guard (only the first 401 actually triggers the network call).
let refreshPromise = null;

function requestRefresh() {
  if (!refreshPromise) {
    refreshPromise = adminRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// On a 401: attempt exactly one silent refresh, then retry the original
// request exactly once. A `_adminRefreshRetried` flag on the request config
// (not the shared refreshPromise) is what actually prevents an infinite
// loop — it's set BEFORE the retry, so if the retried request 401s again
// (refresh "succeeded" but the new token still doesn't work, or the account
// was deactivated in between) this branch is skipped and the session is
// cleared instead of refreshing forever.
adminHttp.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err;
    const status = response?.status;

    if (status !== 401 || !config || isAuthEndpoint(config.url)) {
      return Promise.reject(err);
    }

    if (config._adminRefreshRetried) {
      clearSessionAndRedirect();
      return Promise.reject(err);
    }
    config._adminRefreshRetried = true;

    try {
      await requestRefresh();
    } catch {
      clearSessionAndRedirect();
      return Promise.reject(err);
    }

    return adminHttp(config);
  }
);

export default adminHttp;
