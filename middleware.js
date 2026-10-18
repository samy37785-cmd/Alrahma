import { adminPageResponse } from './api/_lib/adminGate.mjs';

// Vercel Routing Middleware: hides the admin console pages unless the
// browser has opened the secret link (see api/_lib/adminGate.mjs). It runs
// only on these paths; every other page and every API call skips it. The
// admin API is gated in api/v1/admin-proxy.mjs instead.
export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/:lang(ar|fr|it|es|de)/admin',
    '/:lang(ar|fr|it|es|de)/admin/:path*',
    '/admin-access/:path*',
  ],
};

export default function middleware(request) {
  return adminPageResponse(request, process.env.ADMIN_PAGE_KEY);
}
