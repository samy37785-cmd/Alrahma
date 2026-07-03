import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';
import { createAuditLog } from '../services/auditService.js';

const normEmail = (v) => String(v ?? '').toLowerCase().trim();

// auditFromReq (services/auditService.js) reads req.adminId/req.adminUser,
// which only the hardened /api/v1/admin/* auth middleware sets. This router
// authenticates via the regular protect middleware instead (middleware/
// auth.js), which sets req.user — so identity is sourced from there.
function auditUserAction(req, action, resourceId, before, after, severity = 'info') {
  return createAuditLog({
    adminId:    req.user?._id,
    adminEmail: req.user?.email,
    action,
    resource:   'User',
    resourceId,
    before,
    after,
    severity,
    userAgent: req.headers?.['user-agent'] ?? null,
    ip:        req.ip ?? '',
  });
}

// @desc   List all users (admin only)
// @route  GET /api/auth/users
// @access Private/Admin
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 500, maxLimit: 500 });
  const [data, total] = await Promise.all([
    User.find().select('-password').populate('teacher', 'name email')
        .sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(),
  ]);
  return sendPaginated(res, { data, total, page, limit });
});

// @desc   List all teachers (admin only) — for assigning students.
// @route  GET /api/auth/teachers
// @access Private/Admin
export const listTeachers = asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: 'teacher' }).select('name email').sort('name').lean();
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
  await auditUserAction(req, 'user.create', user._id, null, user, role === 'admin' ? 'warning' : 'info');
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
  const previousRole = user.role;

  if (user.role === 'teacher' && role !== 'teacher') {
    await User.updateMany({ teacher: user._id }, { $set: { teacher: null } });
  }
  user.role = role;
  await user.save({ validateBeforeSave: false });
  // Role changes are the most sensitive action on this path (this route has
  // no MFA — see routes/authRoutes.js) — always audited, and flagged as
  // 'warning' whenever admin status itself is granted or revoked.
  await auditUserAction(
    req, 'user.role.update', user._id,
    { role: previousRole }, { role: user.role },
    (previousRole === 'admin' || role === 'admin') ? 'warning' : 'info',
  );
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
  const previousTeacher = student.teacher;

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
  await auditUserAction(
    req, 'user.teacher.assign', student._id,
    { teacher: previousTeacher }, { teacher: student.teacher },
  );
  res.json({ _id: populated._id, name: populated.name, teacher: populated.teacher });
});

// @desc   Admin: set a student's family/household name (for grouping).
// @route  PATCH /api/auth/users/:id/family
// @body   { familyName }
// @access Private/Admin
export const setFamilyName = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  const previousFamilyName = user.familyName;
  user.familyName = String(req.body.familyName || '').trim();
  await user.save({ validateBeforeSave: false });
  await auditUserAction(
    req, 'user.family.update', user._id,
    { familyName: previousFamilyName }, { familyName: user.familyName },
  );
  res.json({ _id: user._id, familyName: user.familyName });
});

// @desc   Admin: update a user's subscription
// @route  PATCH /api/auth/users/:id/subscription
// @access Private/Admin
export const updateUserSubscription = asyncHandler(async (req, res) => {
  const { action, plan } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  const previousSubscription = user.subscription;

  if (action === 'deactivate') {
    user.subscription = { plan: user.subscription?.plan, status: 'inactive', activeSince: user.subscription?.activeSince, validUntil: user.subscription?.validUntil };
  } else {
    const activeSince = action === 'renew' ? (user.subscription?.activeSince || new Date()) : new Date();
    const validUntil  = new Date();
    validUntil.setDate(validUntil.getDate() + 30);
    user.subscription = { plan: plan || user.subscription?.plan || 'Starter', status: 'active', activeSince, validUntil };
  }
  await user.save({ validateBeforeSave: false });
  await auditUserAction(
    req, 'user.subscription.update', user._id,
    { subscription: previousSubscription }, { subscription: user.subscription },
  );
  res.json({ _id: user._id, name: user.name, email: user.email, subscription: user.subscription });
});
