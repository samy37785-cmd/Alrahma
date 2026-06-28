import jwt from 'jsonwebtoken';
import User from '../models/User.js';


// Protects routes: requires a valid "Authorization: Bearer <token>" header.
export async function protect(req, res, next) {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // attach the user (without password) to the request
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ message: 'User no longer exists' });
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

// Attaches req.user if a valid token is present — but never blocks the request.
// Use on routes that are public but benefit from knowing who the caller is.
export async function softProtect(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch { /* no-op — unauthenticated access is fine here */ }
  next();
}
