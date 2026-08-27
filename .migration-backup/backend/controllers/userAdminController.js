import mongoose from 'mongoose';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditFromReq } from '../services/auditService.js';
import { adminSetSubscription } from '../services/subscriptionService.js';

const normEmail = (v) => String(v ?? '').toLowerCase().trim();

const ALLOWED_SUBSCRIPTION_ACTIONS = ['activate', 'renew', 'deactivate'];

// A malformed :id (or, for assignTeacher, a malformed teacherId body value)
// otherwise reaches User.findById() as-is and throws a Mongoose CastError,
// which errorHandler has no specific branch for — it falls through to a
// generic 500 instead of the clean 400 the generic CRUD routes
// (crudController.js) already return for the same mistake.
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// @desc   List all teachers — for assigning students.
// @route  GET /api/v1/admin/users/teachers
// @access Admin (users:read)
export const listTeachers = asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: 'teacher' }).select('name email').sort('name').lean();
  res.json(teachers);
});

// @desc   Admin: create a teacher or parent account.
// @route  POST /api/v1/admin/users
// @body   { name, email, password, role }  role: 'teacher' | 'parent' | 'student'
// @access Admin (users:write)
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
  // Only a super-admin may mint a legacy admin-role User — a regular 'admin'
  // AdminUser has users:write and could otherwise create an MFA-free
  // superuser account outside this hardened stack.
  if (role === 'admin' && req.adminUser?.role !== 'super-admin') {
    res.status(403);
    throw new Error('Only a super-admin may create an account with the admin role');
  }
  const exists = await User.findOne({ email }).lean();
  if (exists) { res.status(409); throw new Error('This email is already registered'); }

  const user = await User.create({ name, email, password, role });
  await auditFromReq(req, 'user.create', 'User', user._id, null, user, role === 'admin' ? 'warning' : 'info');
  res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
});

// @desc   Admin: change a user's role.
// @route  PATCH /api/v1/admin/users/:id/role
// @body   { role }
// @access Admin (users:write)
export const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['student', 'teacher', 'parent', 'admin'].includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }
  // Only a super-admin may promote a User to the legacy admin role (see the
  // matching guard in adminCreateUser). Demoting away from 'admin' is not a
  // privilege escalation and remains available to any admin with users:write.
  if (role === 'admin' && req.adminUser?.role !== 'super-admin') {
    res.status(403);
    throw new Error('Only a super-admin may grant the admin role');
  }
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid ID format');
  }
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  const previousRole = user.role;

  if (user.role === 'teacher' && role !== 'teacher') {
    await User.updateMany({ teacher: user._id }, { $set: { teacher: null } });
  }
  user.role = role;
  await user.save({ validateBeforeSave: false });
  // Role changes are the most sensitive action on this path — always
  // audited, and flagged as 'warning' whenever admin status itself is
  // granted or revoked.
  await auditFromReq(
    req, 'user.role.update', 'User', user._id,
    { role: previousRole }, { role: user.role },
    (previousRole === 'admin' || role === 'admin') ? 'warning' : 'info',
  );
  res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
});

// @desc   Admin: assign (or unassign) a student to a teacher.
// @route  PATCH /api/v1/admin/users/:id/teacher
// @body   { teacherId }   teacherId null/'' to unassign
// @access Admin (users:write)
export const assignTeacher = asyncHandler(async (req, res) => {
  const { teacherId } = req.body;
  if (!isValidObjectId(req.params.id) || (teacherId && !isValidObjectId(teacherId))) {
    res.status(400);
    throw new Error('Invalid ID format');
  }
  const student = await User.findById(req.params.id);
  if (!student) { res.status(404); throw new Error('Student not found'); }
  const previousTeacher = student.teacher;

  if (teacherId) {
    const teacher = await User.findById(teacherId).select('role').lean();
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
  await auditFromReq(
    req, 'user.teacher.assign', 'User', student._id,
    { teacher: previousTeacher }, { teacher: student.teacher },
  );
  res.json({ _id: populated._id, name: populated.name, teacher: populated.teacher });
});

// @desc   Admin: set a student's family/household name (for grouping).
// @route  PATCH /api/v1/admin/users/:id/family
// @body   { familyName }
// @access Admin (users:write)
export const setFamilyName = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid ID format');
  }
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  const previousFamilyName = user.familyName;
  user.familyName = String(req.body.familyName || '').trim();
  await user.save({ validateBeforeSave: false });
  await auditFromReq(
    req, 'user.family.update', 'User', user._id,
    { familyName: previousFamilyName }, { familyName: user.familyName },
  );
  res.json({ _id: user._id, familyName: user.familyName });
});

// @desc   Admin: update a user's subscription
// @route  PATCH /api/v1/admin/users/:id/subscription
// @access Admin (users:write)
export const updateUserSubscription = asyncHandler(async (req, res) => {
  const { action, plan } = req.body;
  if (!ALLOWED_SUBSCRIPTION_ACTIONS.includes(action)) {
    res.status(400);
    throw new Error(`action must be one of: ${ALLOWED_SUBSCRIPTION_ACTIONS.join(', ')}`);
  }
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid ID format');
  }
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  const previousSubscription = user.subscription;

  // Routed through subscriptionService.js's adminSetSubscription rather than
  // reassigning user.subscription directly: a whole-object replace here
  // would silently wipe stripeCustomerId/stripeSubscriptionId/
  // renewalReminderSentFor (and any other subscription field this action
  // isn't meant to touch) the next time an admin renews/deactivates a plan
  // from the dashboard for a user with a live Stripe-billed subscription.
  await adminSetSubscription(user._id, { action, plan, currentSubscription: user.subscription });

  const updatedUser = await User.findById(user._id);
  await auditFromReq(
    req, 'user.subscription.update', 'User', updatedUser._id,
    { subscription: previousSubscription }, { subscription: updatedUser.subscription },
  );
  res.json({ _id: updatedUser._id, name: updatedUser.name, email: updatedUser.email, subscription: updatedUser.subscription });
});
