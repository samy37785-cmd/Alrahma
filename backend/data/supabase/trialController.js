// DATA_BACKEND=supabase controller for trial_requests. Same routes, same
// request validation, same response-shape intent as
// controllers/trialController.js — only the storage layer differs.
//
// Email notifications (config/mailer.js's sendMail calls in the Mongo
// controller — admin notification + student confirmation) are intentionally
// NOT reproduced here: email delivery is unchanged/deferred for the Supabase
// path. There is no functional requirement for notification parity, only
// for the stored-data/API-contract parity implemented below.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withAnonContext, withUserContext } from './client.js';

// @route  POST /api/trials
// @access Public
export const createTrial = asyncHandler(async (req, res) => {
  const { name, email, phone, course, message } = req.body;
  if (!name || !email) {
    res.status(400);
    throw new Error('Name and email are required');
  }

  // trial_requests_insert_public (0002_rls.sql) grants INSERT on exactly
  // (name, email, phone, course, message, status) to anon/authenticated, and
  // its WITH CHECK forces status = 'new' (0002_rls.sql /
  // 0004_privilege_reconciliation.sql). `status` is simply omitted below so
  // the column default ('new') applies. Run as anon regardless of whether
  // req.user happens to be set: this route carries no `protect` middleware,
  // and both anon and authenticated hold the exact same insert grant, so
  // there is no behavioral difference either way.
  //
  // NOTE — no RETURNING clause: Postgres privilege-checks a RETURNING
  // clause the same way it checks a SELECT (see the GRANT reference page's
  // "Notes" section — referencing existing OR newly-inserted column values
  // via RETURNING requires SELECT privilege on those columns), and
  // anon/authenticated have no SELECT grant on trial_requests at all — only
  // this column-restricted INSERT. So the generated `id`/`created_at`
  // cannot be read back here under RLS as designed; the `id` column is also
  // not in the anon-insert column grant, so passing a client-generated id
  // through the INSERT isn't an option either. This is a real gap vs. the
  // Mongo response (which includes the saved document's `_id`/`createdAt`)
  // — documented here rather than worked around via withServiceRole, which
  // would defeat the point of the anon/authenticated grant design for a
  // case the schema author did not carve out.
  await withAnonContext(async (client) => {
    await client.query(
      `INSERT INTO trial_requests (name, email, phone, course, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, email, phone ?? null, course ?? null, message ?? null]
    );
  });

  res.status(201).json({
    message: 'Trial request received',
    trial: {
      name,
      email,
      phone: phone ?? null,
      course: course ?? null,
      message: message ?? null,
      status: 'new',
    },
  });
});

// @route  GET /api/trials
// @access Private/Admin
export const getTrials = asyncHandler(async (req, res) => {
  // trial_requests_select_admin is is_admin()-gated (no AAL2 needed) —
  // withUserContext(req.user._id, ...) is sufficient since req.user is the
  // calling admin's own profile id (protect + adminOnly already verified
  // req.user.role === 'admin' before this handler runs).
  const trials = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT id, name, email, phone, course, message, status, created_at
         FROM trial_requests
        ORDER BY created_at DESC`
    );
    return r.rows;
  });

  // Postgres trial_requests has no updated_at column (see
  // lib/db/drizzle/0000_init_20_table_baseline.sql) — Mongo's `updatedAt`
  // (from { timestamps: true }) has no counterpart and is omitted below.
  res.json(
    trials.map((t) => ({
      _id: t.id,
      name: t.name,
      email: t.email,
      phone: t.phone,
      course: t.course,
      message: t.message,
      status: t.status,
      createdAt: t.created_at,
    }))
  );
});
