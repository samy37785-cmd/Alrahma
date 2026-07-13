import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { forgotPasswordEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { hashToken } from '../utils/hashToken.js';
import { siteOrigin } from '../config/site.js';

// Normalise a user-supplied email for storage AND lookups. Coercing to a String
// also neutralises NoSQL operator injection (e.g. { $gt: '' }) at the boundary —
// defence-in-depth alongside the global sanitizeMongo middleware.
const normEmail = (v) => String(v ?? '').toLowerCase().trim();

// Helper: create a signed JWT for a user id.
// `v` (tokenVersion) is embedded so protect() can reject tokens issued before
// a password change without a DB call per-request — the version mismatch is caught
// only when the user hits a protected route, not immediately on all connections.
function signToken(id, role, v = 0) {
  return jwt.sign({ id, role, v }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const AUTH_COOKIE = 'token';

// Cookie lifetime must always match the JWT's real expiry. Rather than
// re-parsing JWT_EXPIRES_IN ourselves (a second implementation that could
// drift from jsonwebtoken's own parsing), decode the token's own `exp`/`iat`
// claims — jsonwebtoken already resolved whatever format expiresIn was
// (seconds, "15m", "2h", "7d", ...) into those, so reading them back keeps
// the cookie exactly in sync with no extra parsing logic to maintain.
function cookieMaxAgeFor(token) {
  const { exp, iat } = jwt.decode(token);
  return (exp - iat) * 1000;
}

// Sets the auth token as an httpOnly cookie. httpOnly = JS can't read it (XSS
// can't steal it); sameSite=lax = the browser won't send it on cross-site POSTs
// (CSRF protection); secure = HTTPS-only in production.
function authCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  };
}

// Issues the auth cookie and returns the public user profile (no token in the body).
function sendAuth(res, user, status = 200) {
  const token = signToken(user._id, user.role, user.tokenVersion ?? 0);
  res.cookie(AUTH_COOKIE, token, authCookieOptions(cookieMaxAgeFor(token)));
  return res.status(status).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}

// @desc   Register a new account
// @route  POST /api/auth/register
// @access Public
export const register = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { name, password, role } = req.body;
  const email = normEmail(req.body.email);

  // Public sign-up may only create a student or a parent account.
  // Teacher/admin accounts are created by an admin.
  const safeRole = role === 'parent' ? 'parent' : 'student';

  const exists = await User.findOne({ email }).lean();
  if (exists) {
    res.status(409);
    throw new Error('An account with that email already exists. Try signing in instead.');
  }

  const user = await User.create({ name, email, password, role: safeRole });
  sendAuth(res, user, 201);
});

// @desc   Login
// @route  POST /api/auth/login
// @access Public
export const login = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const email = normEmail(req.body.email);
  const { password } = req.body;
  // include password explicitly (it's select:false in the model)
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  sendAuth(res, user);
});

// @desc   Logout — clears the auth cookie
// @route  POST /api/auth/logout
// @access Public
export const logout = asyncHandler(async (_req, res) => {
  // Clear with the same attributes the cookie was set with, or the browser
  // keeps it. maxAge is omitted; expires:past tells the browser to drop it.
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(0), maxAge: undefined });
  res.json({ message: 'Logged out' });
});

// @desc   Get the currently logged-in user
// @route  GET /api/auth/me
// @access Private
export const getMe = asyncHandler(async (req, res) => {
  res.json(req.user); // set by the `protect` middleware
});

// @desc   Student: get (creating if needed) the code a parent uses to link.
// @route  GET /api/auth/link-code
// @access Private (student)
export const getLinkCode = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.parentLinkCode) {
    // Short, unambiguous, human-friendly code.
    user.parentLinkCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    await user.save({ validateBeforeSave: false });
  }
  res.json({ code: user.parentLinkCode });
});

// @desc   Request a password-reset email
// @route  POST /api/auth/forgot-password
// @access Public
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const user = await User.findOne({ email });
  // Always return 200 so we don't leak whether the email exists.
  if (!user) return res.json({ message: 'If that email is registered you will receive a reset link.' });

  // Send the raw token in the email; store only its hash in the DB.
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.resetToken       = hashToken(rawToken);
  user.resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save({ validateBeforeSave: false });

  const link = `${siteOrigin()}/reset-password?token=${rawToken}`;
  await sendMail({
    to: email,
    subject: 'Reset your password — Al-Rahma Academy',
    html: forgotPasswordEmail({ name: user.name, link }),
  });

  res.json({ message: 'If that email is registered you will receive a reset link.' });
});

// @desc   Reset password using token
// @route  POST /api/auth/reset-password
// @access Public
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400);
    throw new Error('Token and new password are required');
  }

  const user = await User.findOne({
    resetToken:       hashToken(token),
    resetTokenExpiry: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error('Reset link is invalid or has expired');
  }

  user.password         = password;
  user.resetToken       = undefined;
  user.resetTokenExpiry = undefined;
  user.tokenVersion     = (user.tokenVersion ?? 0) + 1;
  await user.save();

  res.json({ message: 'Password reset successfully. You can now log in.' });
});

// @desc   Update profile (name, email, password)
// @route  PUT /api/auth/me
// @access Private
export const updateMe = asyncHandler(async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const email = req.body.email != null ? normEmail(req.body.email) : undefined;
  const user = await User.findById(req.user._id).select('+password');

  if (name) user.name = name;
  if (email && email !== user.email) {
    const taken = await User.findOne({ email }).lean();
    if (taken) {
      res.status(409);
      throw new Error('That email is already in use');
    }
    user.email = email;
  }

  if (newPassword) {
    if (!currentPassword) {
      res.status(400);
      throw new Error('Please provide your current password');
    }
    const match = await user.matchPassword(currentPassword);
    if (!match) {
      res.status(401);
      throw new Error('Current password is incorrect');
    }
    user.password     = newPassword;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  }

  await user.save();
  res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
});

// @desc   Google One-Tap / Sign In with Google — exchange ID token for session
// @route  POST /api/auth/google
// @access Public
export const googleAuth = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400);
    throw new Error('Google credential token is required');
  }

  // Verify the ID token via Google's public endpoint — no extra package needed.
  const info = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!info.ok) {
    res.status(401);
    throw new Error('Could not verify Google token');
  }
  const payload = await info.json();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503);
    throw new Error('Google Sign-In is not configured on this server');
  }
  if (payload.aud !== clientId) {
    res.status(401);
    throw new Error('Token audience mismatch');
  }
  if (!payload.email_verified || payload.email_verified === 'false') {
    res.status(401);
    throw new Error('Google email is not verified');
  }

  const email = normEmail(payload.email);
  let user = await User.findOne({ email });

  if (!user) {
    // Auto-register: student role, random password (OAuth users skip password login)
    const randomPwd = crypto.randomBytes(24).toString('hex');
    user = await User.create({
      name: payload.name || email.split('@')[0],
      email,
      password: randomPwd,
      role: 'student',
      googleId: payload.sub,
    });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    await user.save({ validateBeforeSave: false });
  }

  sendAuth(res, user);
});
