import http from './http';

// The backend now requires an explicit ?locale=en|ar on both endpoints (see
// backend/controllers/blogController.js's requireLocale()) — 400 with no
// silent fallback if it's missing or invalid. Callers must always include
// `locale` in `params` / pass it explicitly; see hooks/useBlog.js's
// `enabled` guards, which refuse to fire either request without one.
export const getBlogPosts = (params) => http.get('/blog', { params }).then((r) => r.data);
export const getBlogPost  = (slug, locale) => http.get(`/blog/${slug}`, { params: { locale } }).then((r) => r.data);
