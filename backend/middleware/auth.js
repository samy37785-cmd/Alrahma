import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Resolves the JWT from the httpOnly cookie (primary) or a Bearer header
// (fallback, e.g. for API tooling). The cookie is never readable by JS, which
// is what protects the token from theft via XSS.
function getToken(req) {
  if (req.cookies?.token) return req.cookies.token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
}

// Protects routes: requires a valid auth token (cookie or Bearer header).
export async function protect(req, res, next) {
  const token = getToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }
    // Reject tokens issued before a password change (tokenVersion mismatch).
    if ((decoded.v ?? 0) !== (req.user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: 'Session expired — please log in again' });
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
}

// Restricts a route to admins only. Use after `protect`.
export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// Restricts a route to teachers only. Use after `protect`.
export function teacherOnly(req, res, next) {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ message: 'Teacher access required' });
  }
  next();
}

// Restricts a route to parents only. Use after `protect`.
export function parentOnly(req, res, next) {
  if (req.user?.role !== 'parent') {
    return res.status(403).json({ message: 'Parent access required' });
  }
  next();
}

// Allows staff (admin OR teacher). Use after `protect`.
export function staffOnly(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    return res.status(403).json({ message: 'Staff access required' });
  }
  next();
}

// Attaches req.user if a valid token is present — but never blocks the request.
// Use on routes that are public but benefit from knowing who the caller is.
export async function softProtect(req, res, next) {
  try {
    const token = getToken(req);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch { /* no-op — unauthenticated access is fine here */ }
  next();
}

// Role-guarded protect: verifies JWT, fetches fresh user data from DB (so a
// role change or password reset immediately locks out the old token), and checks
// that the user's current role is among the allowed ones.
// Usage: router.get('/admin-route', requireRole('admin'), handler)
export function requireRole(...roles) {
  return async (req, res, next) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: 'Not authorized, no token' });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return res.status(401).json({ message: 'User no longer exists' });
      if ((decoded.v ?? 0) !== (user.tokenVersion ?? 0)) {
        return res.status(401).json({ message: 'Session expired — please log in again' });
      }
      if (!roles.includes(user.role)) {
        return res.status(403).json({ message: `Access restricted to: ${roles.join(', ')}` });
      }
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  };
}
