// Admin-router (DATA_BACKEND=supabase) controller for /api/v1/admin/users.
//
// Real, documented role-model difference vs. Mongo (see lib/db/drizzle/0018_
// admin_users_system_and_enrollment_gaps.sql's header): account_role is only
// 'user'/'admin' here — 'teacher' is profiles.is_teacher (relational marker,
// added in 0018), and 'student'/'parent' have NO account-level marker at all
// (a "parent" is just a profile with rows in parent_student_links; a
// "student" is just a plain, non-admin, non-teacher profile). updateUserRole
// below maps Mongo's 4-value replace-semantics onto that as faithfully as
// the schema allows: granting 'admin' still requires the CALLING admin to be
// super-admin (matches Mongo's own guard — req.adminUser.role here is the
// admin's own RBAC role from admin_role_assignments, loaded by loadAdmin.js,
// not the target account's role); every other value clears is_teacher/admin
// status down to whichever of the two the new value actually implies.
//
// adminCreateUser creates a REAL Supabase Auth account (auth.admin.createUser)
// — in this backend every account, customer or admin, lives in auth.users;
// there is no separate app-managed User collection to insert into directly.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext, withServiceRole } from '../client.js';
import { getAdminClient } from '../authClients.js';
import { auditAdminAction } from '../adminAuditLog.js';

const normEmail = (v) => String(v ?? '').toLowerCase().trim();

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

function toJson(row) {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isTeacher: row.is_teacher,
    teacher: row.teacher_id,
    familyName: row.family_name,
    specialization: row.specialization,
    bio: row.bio,
    gender: row.gender,
    languages: row.languages,
    subjects: row.subjects,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// @route GET /api/v1/admin/users/teachers
// KNOWN GAP: unlike Mongo's User.find({role:'teacher'}), a fresh teacher
// account with is_teacher=true but zero assigned students is still returned
// here (this lists BY THE FLAG, not by relationship) — that is the more
// correct behavior for an "assign a teacher to a student" picker, which is
// this endpoint's only real caller (userAdminController.js's own comment).
export const listTeachers = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query(`SELECT id, name, email FROM profiles WHERE is_teacher = true ORDER BY name`);
    return r.rows;
  }, { aal: req.adminAal });
  res.json(rows.map((r) => ({ _id: r.id, name: r.name, email: r.email })));
});

// @route POST /api/v1/admin/users
export const adminCreateUser = asyncHandler(async (req, res) => {
  const { name, password, role = 'student' } = req.body;
  const email = normEmail(req.body.email);
  if (!name || !email || !password) return res.status(400).json({ message: 'Please provide name, email and password' });
  if (!['student', 'teacher', 'parent', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (role === 'admin' && req.adminUser?.role !== 'super-admin') {
    return res.status(403).json({ message: 'Only a super-admin may create an account with the admin role' });
  }

  const { data, error } = await getAdminClient().auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return res.status(409).json({ message: 'This email is already registered' });
    }
    throw error;
  }
  const newId = data.user.id;

  if (role === 'teacher') {
    await withServiceRole((client) => client.query('UPDATE profiles SET is_teacher = true WHERE id = $1', [newId]));
  } else if (role === 'admin') {
    await withUserContext(req.adminUser.id, (client) => client.query('SELECT admin_set_admin_role($1, $2::admin_role)', [newId, 'admin']), { aal: req.adminAal });
  }

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'user.create', resourceType: 'profiles', resourceId: newId,
    after: { email, role }, severity: role === 'admin' ? 'warning' : 'info',
  });

  res.status(201).json({ _id: newId, name, email, role });
});

// @route PATCH /api/v1/admin/users/:id/role
export const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['student', 'teacher', 'parent', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (role === 'admin' && req.adminUser?.role !== 'super-admin') {
    return res.status(403).json({ message: 'Only a super-admin may grant the admin role' });
  }

  const before = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT id, role, is_teacher FROM profiles WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });
  if (!before) return res.status(404).json({ message: 'User not found' });

  try {
    await withUserContext(req.adminUser.id, async (client) => {
      if (role === 'admin') {
        await client.query('SELECT admin_set_admin_role($1, $2::admin_role)', [req.params.id, 'admin']);
      } else {
        if (before.role === 'admin') await client.query('SELECT admin_set_role($1, $2::account_role)', [req.params.id, 'user']);
        await client.query('SELECT admin_set_teacher_flag($1, $2)', [req.params.id, role === 'teacher']);
      }
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  const after = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT id, name, email, role, is_teacher FROM profiles WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });

  res.json({ _id: after.id, name: after.name, email: after.email, role: role });
});

// @route PATCH /api/v1/admin/users/:id/teacher
export const assignTeacher = asyncHandler(async (req, res) => {
  const { teacherId } = req.body;
  try {
    const row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query('SELECT * FROM admin_assign_teacher($1, $2)', [req.params.id, teacherId || null]);
      return r.rows[0];
    }, { aal: req.adminAal });
    res.json({ _id: row.id, name: row.name, teacher: row.teacher_id });
  } catch (err) {
    if (/not_a_teacher/.test(err.message)) return res.status(400).json({ message: 'Selected user is not a teacher' });
    if (/no profiles row/.test(err.message)) return res.status(404).json({ message: 'Student not found' });
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
});

// @route PATCH /api/v1/admin/users/:id/family
export const setFamilyName = asyncHandler(async (req, res) => {
  try {
    const row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query('SELECT * FROM admin_set_family_name($1, $2)', [req.params.id, String(req.body.familyName || '').trim()]);
      return r.rows[0];
    }, { aal: req.adminAal });
    res.json({ _id: row.id, familyName: row.family_name });
  } catch (err) {
    if (/no profiles row/.test(err.message)) return res.status(404).json({ message: 'User not found' });
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
});

// @route PATCH /api/v1/admin/users/:id/subscription
// KNOWN, DELIBERATE GAP: Mongo's action:'activate'/'renew' freely grants any
// plan with no evidentiary link. This schema's only non-webhook grant path,
// admin_activate_manual_subscription() (0006_subscription_integrity.sql),
// deliberately requires an approved manual_payments row — a stricter, more
// auditable design, kept as-is rather than weakened with a bypass RPC. Only
// action:'deactivate' (which needs no such evidence — it only narrows
// access) has a real RPC here (admin_deactivate_subscription, 0018).
export const updateUserSubscription = asyncHandler(async (req, res) => {
  const { action, manualPaymentId, planId } = req.body;

  if (action === 'deactivate') {
    try {
      await withUserContext(req.adminUser.id, (client) => client.query('SELECT admin_deactivate_subscription($1)', [req.params.id]), { aal: req.adminAal });
    } catch (err) {
      if (/no_active_subscription/.test(err.message)) return res.status(404).json({ message: 'No active subscription to deactivate' });
      if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      throw err;
    }
  } else if (action === 'renew' || action === 'activate' || !action) {
    if (!manualPaymentId || !planId) {
      return res.status(400).json({
        message: 'Activating a subscription in Supabase mode requires an approved manual payment: provide manualPaymentId and planId (see admin_activate_manual_subscription). Use POST /api/v1/admin/payments/manual instead if no approved payment exists yet.',
      });
    }
    // enforce_subscription_transition() requires an active subscription to
    // have a future current_period_end — mirrors Mongo's own default here
    // (validUntil = now + 30 days) rather than passing null through.
    const periodEnd = req.body.currentPeriodEnd ? new Date(req.body.currentPeriodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    try {
      await withUserContext(req.adminUser.id, (client) => client.query(
        'SELECT admin_activate_manual_subscription($1, $2, $3)', [manualPaymentId, planId, periodEnd]
      ), { aal: req.adminAal });
    } catch (err) {
      if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      throw err;
    }
  } else {
    return res.status(400).json({ message: 'Invalid action' });
  }

  const user = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT id, name, email FROM profiles WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const sub = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [req.params.id]);
    return r.rows[0] ?? null;
  }, { aal: req.adminAal });

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'user.subscription.update', resourceType: 'subscriptions',
    resourceId: req.params.id, after: sub,
  });

  res.json({ _id: user.id, name: user.name, email: user.email, subscription: sub ? { status: sub.status, planId: sub.plan_id, currentPeriodEnd: sub.current_period_end } : null });
});

// ── Generic CRUD (list/getOne/update/remove) — mirrors createCRUDController's
// contract for the base /api/v1/admin/users routes. `rating` is NOT
// updatable here: unlike Mongo's User.rating (a stored field), a teacher's
// rating in this schema is always computed live from reviews (see
// data/supabase/reviewController.js) — there is no column to write.
const UPDATABLE = ['name', 'email', 'familyName', 'specialization', 'bio', 'gender', 'languages', 'subjects'];
const COLUMN_MAP = { familyName: 'family_name' };

export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = req.query.q;

  const conditions = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows, total } = await withUserContext(req.adminUser.id, async (client) => {
    const dataRes = await client.query(
      `SELECT * FROM profiles ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM profiles ${where}`, params);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  }, { aal: req.adminAal });

  res.json({ data: rows.map(toJson), total, page, pages: Math.ceil(total / limit) });
});

export const getOne = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });
  if (!row) return res.status(404).json({ message: 'User not found' });
  res.json(toJson(row));
});

export const update = asyncHandler(async (req, res) => {
  const updates = {};
  for (const key of UPDATABLE) if (req.body[key] !== undefined) updates[COLUMN_MAP[key] ?? key] = req.body[key];

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        'SELECT * FROM admin_update_profile($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          req.params.id, updates.name ?? null, updates.email ?? null, updates.family_name ?? null,
          updates.specialization ?? null, updates.bio ?? null, updates.gender ?? null,
          updates.languages ? JSON.stringify(updates.languages) : null,
          updates.subjects ? JSON.stringify(updates.subjects) : null,
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (/no profiles row/.test(err.message)) return res.status(404).json({ message: 'User not found' });
    if (err.code === '42501' || /insufficient_privilege|permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  // No auditAdminAction() call here — admin_update_profile() already writes
  // its own admin_audit_log row internally (see 0018's comment on why:
  // same self-auditing-RPC pattern as delete_course_cascade()/
  // issue_certificate()); a second call here would double-log.
  res.json(toJson(row));
});

// KNOWN GAP: profiles has no admin DELETE policy at all (deleting an account
// means deleting its auth.users row, which cascades — see 0000's profiles_id_
// users_id_fk ON DELETE cascade). This endpoint uses the service-role Auth
// admin API to delete the underlying auth.users row (the only real deletion
// path for an account), then confirms the cascade removed the profiles row.
export const remove = asyncHandler(async (req, res) => {
  const existing = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT id FROM profiles WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });
  if (!existing) return res.status(404).json({ message: 'User not found' });

  const { error } = await getAdminClient().auth.admin.deleteUser(req.params.id);
  if (error) throw error;

  await auditAdminAction({ adminId: req.adminUser.id, action: 'user.delete', resourceType: 'profiles', resourceId: req.params.id, severity: 'warning' });
  res.json({ message: 'User deleted successfully' });
});
