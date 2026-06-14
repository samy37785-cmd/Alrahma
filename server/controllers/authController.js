import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Helper: create a signed JWT for a user id.
function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// @desc   Register a new account
// @route  POST /api/auth/register
// @access Public
export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400);
      throw new Error('Please provide name, email and password');
    }

    const exists = await User.findOne({ email });
    if (exists) {
      res.status(409);
      throw new Error('This email is already registered');
    }

    const user = await User.create({ name, email, password });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: signToken(user._id),
    });
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

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: signToken(user._id),
    });
  } catch (err) {
    next(err);
  }
}

// @desc   Get the currently logged-in user
// @route  GET /api/auth/me
// @access Private
export async function getMe(req, res) {
  res.json(req.user); // set by the `protect` middleware
}

// @desc   Update profile (name, email, password)
// @route  PUT /api/auth/me
// @access Private
export async function updateMe(req, res, next) {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (name)  user.name  = name;
    if (email) user.email = email;

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
