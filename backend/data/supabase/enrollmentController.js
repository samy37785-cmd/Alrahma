// DATA_BACKEND=supabase controller for enrollments. Admin status-update
// mutation lives elsewhere (see controllers/enrollmentController.js's own
// comment: admin mutations moved to /api/v1/admin/enrollments, MFA + RBAC +
// audit-logged) and is out of scope here regardless of backend.
//
// Email notifications (config/mailer.js's sendMail calls in the Mongo
// controller — admin notification + student confirmation) are intentionally
// NOT reproduced here: email delivery is unchanged/deferred for the
// Supabase path.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../../utils/pagination.js';
import { pickPublicBookingFields, normalizeWhatsapp } from '../../utils/enrollmentValidation.js';
import { withAnonContext, withUserContext } from './client.js';

// Field renames vs. Mongo (docs/option-a-mongo-supabase-parity-map.md,
// "Enrollment" section): teacherId/teacherName -> preferred_teacher_key/
// preferred_teacher_name, plan -> requested_plan_slug, ageGroup -> age_group,
// genderPref -> gender_pref. Mapped back to the Mongo field names below so
// admin-dashboard/consumer code sees the same JSON shape either backend.
function mapRow(row) {
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
    agreedAmount: row.agreed_amount,
    currency: row.currency,
    paymentMethodExternal: row.payment_method_external,
    paidAt: row.paid_at,
    renewalAt: row.renewal_at,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// @route  POST /api/enrollments
// @access Public
export const createEnrollment = asyncHandler(async (req, res) => {
  // Mass-assignment fix, same allowlist as the Mongo controller (see
  // utils/enrollmentValidation.js): only customer-facing fields are ever
  // read from the request body. Booking-First Enrollment also requires a
  // real WhatsApp number (the only contact channel this flow uses).
  const data = pickPublicBookingFields(req.body);
  if (!data.name || !data.email) {
    res.status(400);
    throw new Error('Name and email are required');
  }
  const whatsapp = normalizeWhatsapp(data.whatsapp);
  if (!whatsapp) {
    res.status(400);
    throw new Error('A valid WhatsApp number is required so we can contact you to arrange your booking');
  }

  const times = Array.isArray(data.times) ? data.times : [];
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];

  // submit_enrollment_booking() (0025_booking_first_enrollment.sql) is a
  // narrow SECURITY DEFINER RPC, not a raw table INSERT: anon/authenticated
  // have no SELECT grant on `enrollments` at all (0002_rls.sql), so a plain
  // "INSERT ... RETURNING id" (the old approach here, before Booking-First
  // Enrollment) can never recover the row it just created — Postgres
  // privilege-checks RETURNING like a SELECT. This RPC bypasses that
  // entirely by inserting internally (as its owner) and returning ONLY the
  // generated booking_ref — never a row, never an id, never any other
  // guest's data — which is exactly what the frontend needs to show the
  // student and build their WhatsApp message. Its own parameter list is the
  // allowlist: there is no way to pass status/agreedAmount/currency/
  // paymentMethodExternal/paidAt/renewalAt/adminNote through it at all.
  const bookingRef = await withAnonContext(async (client) => {
    const r = await client.query(
      `SELECT public.submit_enrollment_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) AS ref`,
      [
        data.name,
        data.email,
        whatsapp,
        data.country ?? null,
        data.city ?? null,
        data.timezone ?? null,
        JSON.stringify(times),
        JSON.stringify(subjects),
        data.lang ?? null,
        data.level ?? null,
        data.ageGroup ?? null,
        data.genderPref ?? null,
        data.teacherId != null ? String(data.teacherId) : null,
        data.teacherName ?? null,
        data.plan ?? null,
        data.notes ?? null,
      ]
    );
    return r.rows[0].ref;
  });

  res.status(201).json({ message: 'Booking request received', id: null, bookingRef });
});

// @route  GET /api/enrollments/mine
// @access Student (own enrollment, matched by email)
export const getMyEnrollment = asyncHandler(async (req, res) => {
  // Stage 2E found this endpoint silently broken: `enrollments` had exactly
  // one SELECT policy (admin-only), so a non-admin caller always got 0 rows
  // back regardless of email match. Closed in Stage 2F by adding
  // `enrollments_select_own_by_email` (lib/db/drizzle/0015_new_domains_rls.sql)
  // — `using (email = auth.jwt()->>'email' OR is_admin())` — so the query
  // below (unchanged since Stage 2E) now actually returns the caller's own
  // guest submission(s) by email match.
  const enrollment = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT id, name, email, whatsapp, country, city, timezone, times,
              subjects, lang, level, age_group, gender_pref,
              preferred_teacher_key, preferred_teacher_name,
              requested_plan_slug, status, notes, booking_ref, agreed_amount,
              currency, payment_method_external, paid_at, renewal_at,
              admin_note, created_at, updated_at
         FROM enrollments
        WHERE email = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.user.email]
    );
    return r.rows[0];
  });

  res.json(enrollment ? mapRow(enrollment) : null);
});

// @route  GET /api/enrollments?page=1&limit=500
// @access Admin
export const getEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 500, maxLimit: 500 });

  // enrollments_select_admin is is_admin()-gated (no AAL2 needed) —
  // withUserContext(req.user._id, ...) is sufficient (protect + adminOnly
  // already verified req.user.role === 'admin').
  // Sequential, not Promise.all — a single pg client can only run one query
  // at a time; firing several concurrently on it is deprecated, undefined
  // behavior, not real parallelism (same bug class found and fixed in
  // parentController.js/reviewController.js during the Al-Rahma Final
  // Corrections Part A rehearsal).
  const { rows, total } = await withUserContext(req.user._id, async (client) => {
    const listRes = await client.query(
      `SELECT id, name, email, whatsapp, country, city, timezone, times,
              subjects, lang, level, age_group, gender_pref,
              preferred_teacher_key, preferred_teacher_name,
              requested_plan_slug, status, notes, booking_ref, agreed_amount,
              currency, payment_method_external, paid_at, renewal_at,
              admin_note, created_at, updated_at
         FROM enrollments
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, skip]
    );
    const countRes = await client.query('SELECT count(*)::int AS total FROM enrollments');
    return { rows: listRes.rows, total: countRes.rows[0].total };
  });

  return sendPaginated(res, { data: rows.map(mapRow), total, page, limit });
});
