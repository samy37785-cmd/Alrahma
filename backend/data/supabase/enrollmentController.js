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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// @route  POST /api/enrollments
// @access Public
export const createEnrollment = asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data.name || !data.email) {
    res.status(400);
    throw new Error('Name and email are required');
  }

  // enrollments_insert_public (0002_rls.sql) grants INSERT on exactly the
  // guest-submittable columns below (id/created_at/updated_at are
  // deliberately excluded from that grant — Postgres defaults handle them,
  // per 0002_rls.sql's own privilege-reconciliation comment about not
  // letting a guest backdate created_at), and its WITH CHECK forces
  // status = 'new'; `status` is therefore omitted here.
  //
  // REAL GAP — same root cause as trial_requests/subscribers: no RETURNING
  // clause, because anon/authenticated have no SELECT grant on `enrollments`
  // at all (only this column-restricted INSERT — 0002_rls.sql /
  // 0004_privilege_reconciliation.sql), and Postgres privilege-checks
  // RETURNING like a SELECT. The Mongo response includes the saved
  // document's `_id` (`res.status(201).json({ message, id: enrollment._id
  // })`) — that id genuinely cannot be recovered here under RLS as designed
  // (the anon-insert column grant also excludes `id`, so a client-generated
  // id isn't an option either). Returned as `id: null` below rather than
  // faked or fetched via withServiceRole, which would bypass RLS for a case
  // the schema author didn't carve out for guest submissions.
  const times = Array.isArray(data.times) ? data.times : [];
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];

  await withAnonContext(async (client) => {
    await client.query(
      `INSERT INTO enrollments (
         name, email, whatsapp, country, city, timezone, times, subjects,
         lang, level, age_group, gender_pref, preferred_teacher_key,
         preferred_teacher_name, requested_plan_slug, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        data.name,
        data.email,
        data.whatsapp ?? null,
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
  });

  res.status(201).json({ message: 'Enrollment received', id: null });
});

// @route  GET /api/enrollments/mine
// @access Student (own enrollment, matched by email)
export const getMyEnrollment = asyncHandler(async (req, res) => {
  // REAL, CONFIRMED GAP (found while implementing this exact endpoint, see
  // also docs/option-a-mongo-supabase-parity-map.md's "Enrollment" section):
  // Postgres `enrollments` has exactly one SELECT policy —
  // `enrollments_select_admin`, `for select to authenticated using
  // (is_admin())` (0002_rls.sql). There is NO owner/email-match SELECT
  // policy at all. `authenticated` DOES hold the base table-level SELECT
  // privilege (`grant select on all tables in schema public to
  // authenticated`, 0002_rls.sql / 0004_privilege_reconciliation.sql), so
  // the query below executes without a permission error — but RLS still
  // filters out every row for a non-admin caller regardless of whether
  // `email` matches `req.user.email`, because Postgres RLS policies (not
  // the base GRANT) are the real row-visibility gate, and no policy here
  // ever evaluates "is this my own row by email".
  //
  // Net effect: a regular (non-admin) authenticated user always gets 0 rows
  // back from this query — this endpoint is silently broken (always
  // returns null) for the exact audience it's meant to serve, under
  // DATA_BACKEND=supabase as currently migrated. This is consistent with
  // `enrollments` having no `user_id` column at all (it's guest-submittable
  // by design) — the schema as written does not appear to have been
  // designed with a "logged-in user reads their own guest submission back"
  // case in mind. Fixing this for real needs a new RLS policy added to the
  // schema (e.g. `using (email = (auth.jwt() ->> 'email') OR is_admin())`)
  // — not something this adapter layer can work around without bypassing
  // RLS via withServiceRole, which would defeat row-level security for a
  // case the schema author did not evidently intend regular users to have.
  // Implemented exactly as specified anyway (query by the caller's own
  // email, under the caller's own impersonated identity) so this gap is
  // provable via a real request/response rather than merely asserted.
  const enrollment = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT id, name, email, whatsapp, country, city, timezone, times,
              subjects, lang, level, age_group, gender_pref,
              preferred_teacher_key, preferred_teacher_name,
              requested_plan_slug, status, notes, created_at, updated_at
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
  const { rows, total } = await withUserContext(req.user._id, async (client) => {
    const [listRes, countRes] = await Promise.all([
      client.query(
        `SELECT id, name, email, whatsapp, country, city, timezone, times,
                subjects, lang, level, age_group, gender_pref,
                preferred_teacher_key, preferred_teacher_name,
                requested_plan_slug, status, notes, created_at, updated_at
           FROM enrollments
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, skip]
      ),
      client.query('SELECT count(*)::int AS total FROM enrollments'),
    ]);
    return { rows: listRes.rows, total: countRes.rows[0].total };
  });

  return sendPaginated(res, { data: rows.map(mapRow), total, page, limit });
});
