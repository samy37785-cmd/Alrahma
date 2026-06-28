import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { siteOrigin } from '../config/site.js';

// Normalise a user-supplied email for storage AND lookups. Coercing to a String
// also neutralises NoSQL operator injection (e.g. { $gt: '' }) at the boundary —
// defence-in-depth alongside the global sanitizeMongo middleware.
const normEmail = (v) => String(v ?? '').toLowerCase().trim();

// Hash a reset token before it touches the DB, so a leaked database snapshot
// can't be used to reset anyone's password within the validity window.
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

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
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days, matches JWT default

// Sets the auth token as an httpOnly cookie. httpOnly = JS can't read it (XSS
// can't steal it); sameSite=lax = the browser won't send it on cross-site POSTs
// (CSRF protection); secure = HTTPS-only in production.
function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

// Issues the auth cookie and returns the public user profile (no token in the body).
function sendAuth(res, user, status = 200) {
  res.cookie(AUTH_COOKIE, signToken(user._id, user.role, user.tokenVersion ?? 0), authCookieOptions());
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
  const { name, password, role } = req.body;
  const email = normEmail(req.body.email);
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please provide name, email and password');
  }

  // Public sign-up may only create a student or a parent account.
  // Teacher/admin accounts are created by an admin.
  const safeRole = role === 'parent' ? 'parent' : 'student';

  const exists = await User.findOne({ email });
  if (exists) {
    res.status(409);
    throw new Error('This email is already registered');
  }

  const user = await User.create({ name, email, password, role: safeRole });
  sendAuth(res, user, 201);
});

// @desc   Login
// @route  POST /api/auth/login
// @access Public
export const login = asyncHandler(async (req, res) => {
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
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
  res.json({ message: 'Logged out' });
});

// @desc   Get the currently logged-in user
// @route  GET /api/auth/me
// @access Private
export const getMe = asyncHandler(async (req, res) => {
  res.json(req.user); // set by the `protect` middleware
});

// @desc   List all users (admin only)
// @route  GET /api/auth/users
// @access Private/Admin
export const listUsers = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(500, parseInt(req.query.limit) || 500);
  const skip  = (page - 1) * limit;

  const [data, total] = await Promise.all([
    User.find().select('-password').populate('teacher', 'name email')
        .sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(),
  ]);
  res.json({ data, total, page, pages: Math.ceil(total / limit) });
});

// @desc   List all teachers (admin only) — for assigning students.
// @route  GET /api/auth/teachers
// @access Private/Admin
export const listTeachers = asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: 'teacher' }).select('name email').sort('name');
  res.json(teachers);
});

// @desc   Admin: create a teacher or parent account.
// @route  POST /api/auth/users
// @body   { name, email, password, role }  role: 'teacher' | 'parent' | 'student'
// @access Private/Admin
export const adminCreateUser = asyncHandler(async (req, res) => {
  const { name, password, role = 'student' } = req.body;
  const email = normEmail(req.body.email);
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please provide name, email and password');
  }
  if (!['student', 'teacher', 'parent', 'admin'].includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }
  const exists = await User.findOne({ email });
  if (exists) { res.status(409); throw new Error('This email is already registered'); }

  const user = await User.create({ name, email, password, role });
  res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
});

// @desc   Admin: change a user's role.
// @route  PATCH /api/auth/users/:id/role
// @body   { role }
// @access Private/Admin
export const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['student', 'teacher', 'parent', 'admin'].includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }

  // Leaving the teacher role: detach this teacher from any students.
  if (user.role === 'teacher' && role !== 'teacher') {
    await User.updateMany({ teacher: user._id }, { $set: { teacher: null } });
  }
  user.role = role;
  await user.save({ validateBeforeSave: false });
  res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
});

// @desc   Admin: assign (or unassign) a student to a teacher.
// @route  PATCH /api/auth/users/:id/teacher
// @body   { teacherId }   teacherId null/'' to unassign
// @access Private/Admin
export const assignTeacher = asyncHandler(async (req, res) => {
  const { teacherId } = req.body;
  const student = await User.findById(req.params.id);
  if (!student) { res.status(404); throw new Error('Student not found'); }

  if (teacherId) {
    const teacher = await User.findById(teacherId).select('role');
    if (!teacher || teacher.role !== 'teacher') {
      res.status(400);
      throw new Error('Selected user is not a teacher');
    }
    student.teacher = teacherId;
  } else {
    student.teacher = null;
  }
  await student.save({ validateBeforeSave: false });
  const populated = await student.populate('teacher', 'name email');
  res.json({ _id: populated._id, name: populated.name, teacher: populated.teacher });
});

// @desc   Admin: set a student's family/household name (for grouping).
// @route  PATCH /api/auth/users/:id/family
// @body   { familyName }
// @access Private/Admin
export const setFamilyName = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  user.familyName = String(req.body.familyName || '').trim();
  await user.save({ validateBeforeSave: false });
  res.json({ _id: user._id, familyName: user.familyName });
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

// @desc   Admin: update a user's subscription
// @route  PATCH /api/auth/users/:id/subscription
// @access Private/Admin
export const updateUserSubscription = asyncHandler(async (req, res) => {
  const { action, plan } = req.body; // action: 'activate' | 'deactivate' | 'renew'
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }

  if (action === 'deactivate') {
    user.subscription = { plan: user.subscription?.plan, status: 'inactive', activeSince: user.subscription?.activeSince, validUntil: user.subscription?.validUntil };
  } else {
    const activeSince = action === 'renew' ? (user.subscription?.activeSince || new Date()) : new Date();
    const validUntil  = new Date();
    validUntil.setDate(validUntil.getDate() + 30);
    user.subscription = { plan: plan || user.subscription?.plan || 'Starter', status: 'active', activeSince, validUntil };
  }
  await user.save({ validateBeforeSave: false });
  res.json({ _id: user._id, name: user.name, email: user.email, subscription: user.subscription });
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
    subject: 'Reset your password — AL-Rahma Academy',
    html: `
      <p>Hi ${user.name},</p>
      <p>Click the button below to reset your password. The link expires in 1 hour.</p>
      <a href="${link}" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Reset Password</a>
      <p style="color:#888;font-size:12px;">If you didn't request this, ignore this email.</p>
    `,
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
    const taken = await User.findOne({ email });
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
