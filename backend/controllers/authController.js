import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';

// Helper: create a signed JWT for a user id.
function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
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
  res.cookie(AUTH_COOKIE, signToken(user._id), authCookieOptions());
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
export async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
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
  } catch (err) {
    next(err);
  }
}

// @desc   Login
// @route  POST /api/auth/login
// @access Public
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    // include password explicitly (it's select:false in the model)
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      throw new Error('Invalid email or password');
    }

    sendAuth(res, user);
  } catch (err) {
    next(err);
  }
}

// @desc   Logout — clears the auth cookie
// @route  POST /api/auth/logout
// @access Public
export async function logout(_req, res) {
  // Clear with the same attributes the cookie was set with, or the browser
  // keeps it. maxAge is omitted; expires:past tells the browser to drop it.
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
  res.json({ message: 'Logged out' });
}

// @desc   Get the currently logged-in user
// @route  GET /api/auth/me
// @access Private
export async function getMe(req, res) {
  res.json(req.user); // set by the `protect` middleware
}

// @desc   List all users (admin only)
// @route  GET /api/auth/users
// @access Private/Admin
export async function listUsers(req, res, next) {
  try {
    const users = await User.find()
      .select('-password')
      .populate('teacher', 'name email')
      .sort('-createdAt');
    res.json(users);
  } catch (err) {
    next(err);
  }
}

// @desc   List all teachers (admin only) — for assigning students.
// @route  GET /api/auth/teachers
// @access Private/Admin
export async function listTeachers(req, res, next) {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('name email').sort('name');
    res.json(teachers);
  } catch (err) {
    next(err);
  }
}

// @desc   Admin: create a teacher or parent account.
// @route  POST /api/auth/users
// @body   { name, email, password, role }  role: 'teacher' | 'parent' | 'student'
// @access Private/Admin
export async function adminCreateUser(req, res, next) {
  try {
    const { name, email, password, role = 'student' } = req.body;
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
  } catch (err) {
    next(err);
  }
}

// @desc   Admin: change a user's role.
// @route  PATCH /api/auth/users/:id/role
// @body   { role }
// @access Private/Admin
export async function updateUserRole(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

// @desc   Admin: assign (or unassign) a student to a teacher.
// @route  PATCH /api/auth/users/:id/teacher
// @body   { teacherId }   teacherId null/'' to unassign
// @access Private/Admin
export async function assignTeacher(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

// @desc   Admin: set a student's family/household name (for grouping).
// @route  PATCH /api/auth/users/:id/family
// @body   { familyName }
// @access Private/Admin
export async function setFamilyName(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) { res.status(404); throw new Error('User not found'); }
    user.familyName = (req.body.familyName || '').trim();
    await user.save({ validateBeforeSave: false });
    res.json({ _id: user._id, familyName: user.familyName });
  } catch (err) {
    next(err);
  }
}

// @desc   Student: get (creating if needed) the code a parent uses to link.
// @route  GET /api/auth/link-code
// @access Private (student)
export async function getLinkCode(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user.parentLinkCode) {
      // Short, unambiguous, human-friendly code.
      user.parentLinkCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      await user.save({ validateBeforeSave: false });
    }
    res.json({ code: user.parentLinkCode });
  } catch (err) {
    next(err);
  }
}

// @desc   Admin: update a user's subscription
// @route  PATCH /api/auth/users/:id/subscription
// @access Private/Admin
export async function updateUserSubscription(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

// @desc   Request a password-reset email
// @route  POST /api/auth/forgot-password
// @access Public
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    // Always return 200 so we don't leak whether the email exists.
    if (!user) return res.json({ message: 'If that email is registered you will receive a reset link.' });

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 60 * 60 * 1000; // 1 hour
    user.resetToken       = token;
    user.resetTokenExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
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
  } catch (err) {
    next(err);
  }
}

// @desc   Reset password using token
// @route  POST /api/auth/reset-password
// @access Public
export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400);
      throw new Error('Token and new password are required');
    }

    const user = await User.findOne({
      resetToken:       token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      res.status(400);
      throw new Error('Reset link is invalid or has expired');
    }

    user.password         = password;
    user.resetToken       = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

// @desc   Update profile (name, email, password)
// @route  PUT /api/auth/me
// @access Private
export async function updateMe(req, res, next) {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (name) user.name = name;
    if (email && email.toLowerCase() !== user.email) {
      const taken = await User.findOne({ email: email.toLowerCase() });
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
      user.password = newPassword;
    }

    await user.save();
    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
}
