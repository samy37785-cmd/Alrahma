import { forwardPublicForm } from '../_lib/publicFormProxy.mjs';

// POST /api/trials, reached by the exact-literal "/api/trials" rewrite in
// vercel.json. Signs the visitor's IP so the backend's trial limiter counts
// each visitor on their own. See docs/public-proxy-signing-runbook.md.
export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  return forwardPublicForm(req, res, '/api/trials');
}
