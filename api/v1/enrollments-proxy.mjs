import { forwardPublicForm } from '../_lib/publicFormProxy.mjs';

// POST /api/enrollments, reached by the exact-literal "/api/enrollments"
// rewrite in vercel.json. Signs the visitor's IP so the backend's booking
// limiter counts each visitor on their own. /api/enrollments/mine and every
// other subpath keep the general rewrite. See
// docs/public-proxy-signing-runbook.md.
export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  return forwardPublicForm(req, res, '/api/enrollments');
}
