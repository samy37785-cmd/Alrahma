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

// Shared auth core used by protect().
// Verifies the JWT, loads the user from the DB, and checks tokenVersion.
// On any failure it writes the 401 response and returns null so callers
// can return immediately without touching `res` again.
async function _loadUser(req, res) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
    return null;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.status(401).json({ message: 'User no longer exists' });
      return null;
    }
    // Reject tokens issued before a password change (tokenVersion mismatch).
    if ((decoded.v ?? 0) !== (user.tokenVersion ?? 0)) {
      res.status(401).json({ message: 'Session expired — please log in again' });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ message: 'Not authorized, token failed' });
    return null;
  }
}

// Protects routes: requires a valid auth token (cookie or Bearer header).
export async function protect(req, res, next) {
  const user = await _loadUser(req, res);
  if (!user) return;
  req.user = user;
  next();
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

// Requires the caller to re-submit their current password in the request
// body immediately before a highly sensitive mutation proceeds. Use after
// `protect` (+ `adminOnly` where relevant).
//
// This is a stopgap step-up gate for routes/authRoutes.js's legacy admin
// user-management routes, which — unlike the hardened /api/v1/admin/*
// stack (TOTP MFA via middleware/adminAuth.js) — have no MFA of their own;
// a stolen/replayed session cookie alone is currently sufficient to grant
// roles, mint admin accounts, or activate subscriptions on that path (see
// the TODO in routes/authRoutes.js). Re-proving the password at the moment
// of the action closes that gap until those routes are migrated onto the
// MFA-protected admin API.
export async function requireStepUp(req, res, next) {
  const { currentPassword } = req.body;
  if (!currentPassword) {
    return res.status(400).json({ message: 'Current password is required to confirm this action' });
  }
  const user = await User.findById(req.user._id).select('+password');
  const matches = user && await user.matchPassword(currentPassword);
  if (!matches) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }
  next();
}

// Attaches req.user if a valid token is present — but never blocks the request.
// Use on routes that are public but benefit from knowing who the caller is.
export async function softProtect(req, res, next) {
  try {
    const token = getToken(req);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      const user = await User.findById(decoded.id).select('-password');
      // Honour tokenVersion so a post-password-reset token doesn't persist here either.
      if (user && (decoded.v ?? 0) === (user.tokenVersion ?? 0)) {
        req.user = user;
      }
    }
  } catch { /* no-op — unauthenticated access is fine here */ }
  next();
}
