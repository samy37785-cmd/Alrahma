import crypto from 'crypto';
import { body } from 'express-validator';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { forgotPasswordEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { hashToken } from '../utils/hashToken.js';
import { siteOrigin } from '../config/site.js';
import { AUTH_COOKIE, authCookieOptions, sendAuth } from '../utils/authCookie.js';

// Normalise a user-supplied email for storage AND lookups. Coercing to a String
// also neutralises NoSQL operator injection (e.g. { $gt: '' }) at the boundary —
// defence-in-depth alongside the global sanitizeMongo middleware.
const normEmail = (v) => String(v ?? '').toLowerCase().trim();

// Deliberately does NOT use express-validator's .normalizeEmail() — that
// sanitizer applies provider-specific rewrites (e.g. stripping dots/+tags
// from Gmail addresses) that would silently change what email a user
// actually registers with. .isEmail() here is a pure format gate; the
// existing normEmail() above remains the only source of normalization,
// unchanged.
export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('A valid email is required'),
  body('password').isString().withMessage('Password is required').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

// login only needs to guard against malformed *types* reaching
// user.matchPassword() — bcrypt.compare() throws (not a clean 401) if
// password isn't a string, e.g. a request with no password field at all, or
// password sent as a number/object/array. This does not change behavior for
// any well-formed request: correct/incorrect credentials still resolve to
// the same 200/401 as before.
export const loginValidation = [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('A valid email is required'),
  body('password').isString().withMessage('Password is required').notEmpty().withMessage('Password is required'),
];

// @desc   Register a new account
// @route  POST /api/auth/register
// @access Public
export const register = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { name, password } = req.body;
  const email = normEmail(req.body.email);

  // Security batch (auth hardening): public registration MUST NOT be able to
  // elevate or otherwise choose its own account type. Any `role`/`accountType`
  // the client sends is read here only to be discarded — never passed to
  // User.create(). This used to accept `role: 'parent'` from the client
  // (`role === 'parent' ? 'parent' : 'student'`), which meant a public
  // registration payload could actually mint a `parent` account; `admin`/
  // `teacher` were already unreachable this way, but `parent` was a real,
  // live self-elevation path. It is closed now: every public account is
  // created with the storage-layer role `'student'`, unconditionally.
  //
  // Storage name vs. public contract: `User.role`'s DB values remain
  // `student`/`teacher`/`parent`/`admin` (models/User.js) — that enum is
  // unchanged here since widening/renaming it would be a schema migration
  // this fix does not need. But every public-facing contract (this endpoint,
  // the frontend's `src/utils/accountRoles.js`, docs/user-admin-auth-
  // contract.md) treats every non-admin account as a single generic `user`.
  // `'student'` is that contract's one storage-layer representative — not a
  // real "you are a student" claim — exactly as `teacher`/`parent` account
  // types are already retired product-side (see the auth contract doc's
  // target-contract §2). `admin` is never reachable from this endpoint at
  // all, under any input, matching the target contract's rule that admin is
  // proven exclusively by a real `AdminUser` + MFA session.

  const exists = await User.findOne({ email }).lean();
  if (exists) {
    res.status(409);
    throw new Error('An account with that email already exists. Try signing in instead.');
  }

  const user = await User.create({ name, email, password, role: 'student' });
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
