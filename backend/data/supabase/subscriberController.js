// DATA_BACKEND=supabase controller for subscribers. Same routes as
// controllers/subscriberController.js — see subscribe()'s comment for one
// real, unavoidable divergence in the idempotent-insert contract.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withAnonContext, withUserContext } from './client.js';

// @route  POST /api/newsletter
// @access Public
export const subscribe = asyncHandler(async (req, res) => {
  const email = String(req.body.email ?? '').toLowerCase().trim();
  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  // The Mongo controller does a findOne-then-create so it can report 200
  // ("Already subscribed") vs. 201 ("Subscribed successfully") accurately.
  // Not reproducible exactly here: anon/authenticated have no SELECT grant
  // on `subscribers` at all — only a column-restricted INSERT (email,
  // status) (0002_rls.sql / 0004_privilege_reconciliation.sql).
  //
  // REAL GAP FOUND DURING REHEARSAL (broader than initially documented): a
  // plain `INSERT ... ON CONFLICT (...) DO NOTHING` ALSO fails for anon here
  // — not just RETURNING/DO UPDATE. Postgres requires SELECT privilege on
  // any column referenced by the conflict_target expression to even
  // evaluate the arbiter index, regardless of DO NOTHING vs DO UPDATE (see
  // https://www.postgresql.org/docs/current/sql-insert.html, "Conflicts").
  // Confirmed directly: `SET ROLE anon; INSERT ... ON CONFLICT ((lower(
  // email))) DO NOTHING` raises "permission denied for table subscribers",
  // while the exact same INSERT with no ON CONFLICT clause at all succeeds.
  // So the idempotent-upsert approach cannot work at all for a guest
  // visitor under this schema's current grants — instead, this does a bare
  // INSERT and catches the resulting unique_violation (Postgres error code
  // 23505, raised by the constraint itself, which needs no extra privilege
  // to observe) as "already subscribed", restoring the same idempotent
  // 200-either-way contract the Mongo path has, without requiring any
  // schema/grant change.
  await withAnonContext(async (client) => {
    try {
      await client.query('INSERT INTO subscribers (email) VALUES ($1)', [email]);
    } catch (err) {
      if (err.code !== '23505') throw err; // not a duplicate-email conflict — a real failure
    }
  });

  res.status(200).json({ message: 'Subscribed' });
});

// @route  GET /api/newsletter
// @access Private/Admin
export const listSubscribers = asyncHandler(async (req, res) => {
  // subscribers_select_admin is is_admin()-gated (no AAL2 needed) —
  // withUserContext(req.user._id, ...) is sufficient (protect + adminOnly
  // already verified req.user.role === 'admin').
  const subscribers = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT id, email, status, created_at
         FROM subscribers
        ORDER BY created_at DESC`
    );
    return r.rows;
  });

  // Postgres subscribers has no updated_at column, unlike Mongo's
  // { timestamps: true } — omitted below, same as trial_requests.
  res.json(
    subscribers.map((s) => ({
      _id: s.id,
      email: s.email,
      status: s.status,
      createdAt: s.created_at,
    }))
  );
});
