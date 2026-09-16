// Admin-router (DATA_BACKEND=supabase) controller for
// /api/v1/admin/enrollments. enrollments_select_admin/_update_admin_aal2/
// _delete_admin_aal2 (0002_rls.sql) already exist; enrollments_insert_
// admin_aal2 (lib/db/drizzle/0018_admin_users_system_and_enrollment_gaps.sql)
// is new — the public path (enrollments_insert_public) forces status='new'
// and its GRANT excludes status/id/created_at/updated_at, so an admin
// authoring a fully-specified record needed a real, separate policy.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';
import { buildAdminUpdatePatch } from '../../../utils/enrollmentValidation.js';

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

// Historical offline-payment-bookkeeping columns (agreed_amount/currency/
// payment_method_external/paid_at/renewal_at) still exist on this table for
// old rows (never dropped/migrated away by app code), but this admin API
// never surfaces them — status/adminNote plus the booking's own fields are
// all a caller of this API can read or write here.
function toJson(row) {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    country: row.country,
    city: row.city,
    timezone: row.timezone,
    times: row.times,
    subjects: row.subjects,
    lang: row.lang,
    level: row.level,
    ageGroup: row.age_group,
    genderPref: row.gender_pref,
    teacherId: row.preferred_teacher_key,
    teacherName: row.preferred_teacher_name,
    plan: row.requested_plan_slug,
    status: row.status,
    notes: row.notes,
    bookingRef: row.booking_ref,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// @route GET /api/v1/admin/enrollments
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { status, plan, country } = req.query;

  const conditions = [];
  const params = [];
  if (status)  { params.push(status);  conditions.push(`status = $${params.length}`); }
  if (plan)    { params.push(plan);    conditions.push(`requested_plan_slug = $${params.length}`); }
  if (country) { params.push(country); conditions.push(`country = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows, total } = await withUserContext(req.adminUser.id, async (client) => {
    const dataRes = await client.query(
      `SELECT * FROM enrollments ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM enrollments ${where}`, params);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  }, { aal: req.adminAal });

  res.json({ data: rows.map(toJson), total, page, pages: Math.ceil(total / limit) });
});

// @route GET /api/v1/admin/enrollments/:id
export const getOne = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM enrollments WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });

  if (!row) return res.status(404).json({ message: 'Enrollment not found' });
  res.json(toJson(row));
});

// @route POST /api/v1/admin/enrollments
export const create = asyncHandler(async (req, res) => {
  const d = req.body;
  if (!d.name || !d.email) return res.status(400).json({ message: 'Name and email are required' });

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `INSERT INTO enrollments (
           name, email, whatsapp, country, city, timezone, times, subjects, lang, level,
           age_group, gender_pref, preferred_teacher_key, preferred_teacher_name,
           requested_plan_slug, status, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16,'new'),$17)
         RETURNING *`,
        [
          d.name, d.email, d.whatsapp ?? null, d.country ?? null, d.city ?? null, d.timezone ?? null,
          JSON.stringify(d.times ?? []), JSON.stringify(d.subjects ?? []), d.lang ?? null, d.level ?? null,
          d.ageGroup ?? null, d.genderPref ?? null,
          d.teacherId != null ? String(d.teacherId) : null, d.teacherName ?? null,
          d.plan ?? null, d.status ?? null, d.notes ?? null,
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  await auditAdminAction({ adminId: req.adminUser.id, action: 'enrollment.create', resourceType: 'enrollments', resourceId: row.id, after: row });
  res.status(201).json(toJson(row));
});

// JS field -> DB column, for the dynamic SET clause below. Kept as an
// explicit map (not a naive camelCase->snake_case transform) so it can
// never silently pick up an unintended column if a new JS-side field name
// happens to transform into a real column that was never meant to be
// admin-PUT-able.
const UPDATE_FIELD_TO_COLUMN = {
  name: 'name', email: 'email', whatsapp: 'whatsapp', country: 'country', city: 'city',
  timezone: 'timezone', notes: 'notes', status: 'status', adminNote: 'admin_note',
};

// @route PUT /api/v1/admin/enrollments/:id
export const update = asyncHandler(async (req, res) => {
  // The previous COALESCE($n, col)-style UPDATE could never distinguish "a
  // field the caller didn't mention" from "a field the caller explicitly
  // wants cleared to null" — both arrive as a SQL NULL parameter, so a
  // deliberate clear of e.g. adminNote was silently impossible. This
  // version fetches the existing row first and builds the SET clause only
  // from keys actually present in the sanitized patch (same shared
  // allowlist+validation used by the Mongo backend's admin route, see
  // utils/enrollmentValidation.js), so an explicit `null` really does clear
  // the column while an omitted key truly leaves it untouched.
  const existing = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM enrollments WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });
  if (!existing) return res.status(404).json({ message: 'Enrollment not found' });

  const { patch, error } = buildAdminUpdatePatch(req.body);
  if (error) return res.status(422).json({ message: error });

  const keys = Object.keys(patch);
  if (keys.length === 0) return res.json(toJson(existing));

  const setClauses = keys.map((key, i) => `${UPDATE_FIELD_TO_COLUMN[key]} = $${i + 2}`);
  const values = keys.map((key) => patch[key]);

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE enrollments SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Enrollment not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'enrollment.update', resourceType: 'enrollments', resourceId: row.id, after: row });
  res.json(toJson(row));
});

// Scope correction (see docs/current-project-status.md; mirrors backend's
// controllers/enrollmentController.js's Mongo-side approveEnrollment): the
// one admin action that links a booking to a registered account and
// activates their subscription/content access. Under DATA_BACKEND=supabase
// this calls the admin_activate_subscription_from_enrollment() RPC
// (lib/db/drizzle/0028_admin_booking_activation.sql), which resolves the
// plan to activate FROM THE BOOKING ITSELF (enrollments.requested_plan_slug
// matched against plans.slug/name) — there is no planId for this endpoint
// to accept or require; the frontend's "Approve & Activate" button calls
// this with no body, exactly like the Mongo side. The RPC internally
// creates an admin-attested manual_payments row and then calls the
// existing, unmodified admin_activate_manual_subscription() — see that
// migration's own comment for why activation stays evidence-based (a real
// manual_payments row) rather than a free-form grant like Mongo's.
//
// @route PATCH /api/v1/admin/enrollments/:id/approve
// @body { currentPeriodEnd? }
export const approve = asyncHandler(async (req, res) => {
  const { currentPeriodEnd } = req.body;
  // enforce_subscription_transition() requires an active subscription to
  // have a future current_period_end — mirrors Mongo's own default here
  // (validUntil = now + 30 days) rather than passing null through.
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  let subscription;
  try {
    subscription = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        'SELECT * FROM admin_activate_subscription_from_enrollment($1, $2)',
        [req.params.id, periodEnd]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (/not an AAL2-verified admin/.test(err.message)) return res.status(403).json({ message: 'AAL2 verification required' });
    if (/lacks the enrollments:write permission/.test(err.message)) return res.status(403).json({ message: 'Insufficient permissions' });
    if (/not a booking awaiting approval/.test(err.message)) return res.status(409).json({ message: err.message });
    if (/no registered account found/.test(err.message)) return res.status(422).json({ message: err.message });
    if (/has no requested_plan_slug on record/.test(err.message)) return res.status(422).json({ message: err.message });
    if (/no active plan matches the booking's requested plan/.test(err.message)) return res.status(422).json({ message: err.message });
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) return res.status(403).json({ message: 'Insufficient permissions' });
    throw err;
  }

  const enrollmentRow = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM enrollments WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'enrollment.approve', resourceType: 'enrollments',
    resourceId: req.params.id, after: { status: 'enrolled', subscriptionId: subscription.id },
  });

  res.json({
    message: 'Booking approved and subscription activated',
    enrollment: toJson(enrollmentRow),
    subscription: { status: subscription.status, planId: subscription.plan_id, currentPeriodEnd: subscription.current_period_end },
  });
});

// @route DELETE /api/v1/admin/enrollments/:id
export const remove = asyncHandler(async (req, res) => {
  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query('DELETE FROM enrollments WHERE id = $1 RETURNING id', [req.params.id]);
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
  if (!row) return res.status(404).json({ message: 'Enrollment not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'enrollment.delete', resourceType: 'enrollments', resourceId: row.id, severity: 'warning' });
  res.json({ message: 'Enrollment deleted successfully' });
});
