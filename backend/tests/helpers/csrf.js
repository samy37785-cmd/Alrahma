import request from 'supertest';

// Every mutating request must carry a matching csrf_token cookie + X-CSRF-Token
// header (middleware/csrf.js) — real production behavior, not something to
// bypass in tests. Makes one safe-method request to receive the cookie (a
// supertest agent then resends it automatically on every later request via
// this same agent), and returns the header to echo back on writes.
export async function agentWithCsrf(app) {
  const agent = request.agent(app);
  const res = await agent.get('/health');
  const setCookie = res.headers['set-cookie'] || [];
  const match = setCookie.map(String).find((c) => c.startsWith('csrf_token='));
  const token = match ? match.split(';')[0].split('=')[1] : null;
  if (!token) throw new Error('csrf_token cookie was not issued by /health');
  return { agent, csrf: { 'x-csrf-token': token } };
}
