// Strips MongoDB operator/dot keys ($gt, $ne, "a.b", …) out of user-supplied
// input (req.body / req.query) to prevent NoSQL operator-injection. Unlike
// mongoose's global `sanitizeFilter`, this only touches incoming data — it never
// interferes with operator queries the application itself builds in code.
function scrub(obj, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || Buffer.isBuffer(obj) || seen.has(obj)) return;
  seen.add(obj);
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
      continue;
    }
    scrub(obj[key], seen);
  }
}

export function sanitizeMongo(req, _res, next) {
  // req.body and the properties of req.query are mutable in Express 4 — we edit
  // in place rather than reassigning so we don't fight read-only getters.
  scrub(req.body);
  scrub(req.query);
  scrub(req.params);
  next();
}
