// DATA_BACKEND=supabase auth controller. Same routes, same request
// validation, same response shapes, same `token` cookie contract as
// controllers/authController.js (both use utils/authCookie.js) — the
// frontend cannot tell the two apart. Underneath, password verification and
// account creation are delegated entirely to Supabase Auth (GoTrue); this
// backend never hashes or compares a password itself under this backend.
//
// Known gaps vs. the Mongo controller (see docs/option-a-mongo-supabase-
// parity-map.md and data/supabase/loadUser.js's module comment): role is
// always 'user' or 'admin' (no student/teacher/parent distinction), no
// gamification/teacher-linking/referral fields, and password changes don't
// invalidate other existing sessions (no tokenVersion column).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { handleValidationErrors } from '../../utils/validationHelper.js';
import { AUTH_COOKIE, authCookieOptions, sendAuth } from '../../utils/authCookie.js';
import { getAdminClient, getAnonClient } from './authClients.js';
import { withUserContext } from './client.js';
import { loadUserById } from './loadUser.js';

// Re-exported so the supabase route file can use the exact same
// express-validator chains as the Mongo route file (same request contract).
export { registerValidation, loginValidation } from '../../controllers/authController.js';

const normEmail = (v) => String(v ?? '').toLowerCase().trim();

// @route  POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { name, password } = req.body;
  const email = normEmail(req.body.email);

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // handle_new_user() (lib/db/drizzle/0001_functions_triggers.sql) always
    // forces role='user' regardless of what's in user_metadata — this is
    // tested behavior on the Postgres side, not something this controller
    // needs to (or can) override. Public sign-up never yields role='admin'
    // under either backend.
    user_metadata: { name },
  });

  if (error) {
    // GoTrue's own duplicate-email error — surfaced with the same status/
    // message shape the Mongo path uses for the same condition.
    res.status(error.status === 422 ? 409 : error.status || 400);
    throw new Error(
      error.status === 422
        ? 'An account with that email already exists. Try signing in instead.'
        : error.message
    );
  }

  // handle_new_user() runs synchronously in the same transaction as the
  // auth.users insert, so the profiles row already exists by the time
  // createUser() has returned.
  const profile = await withUserContext(data.user.id, async (client) => {
    const r = await client.query('SELECT id, email, name, role FROM profiles WHERE id = $1', [
      data.user.id,
    ]);
    return r.rows[0];
  });

  sendAuth(res, { _id: profile.id, name: profile.name, email: profile.email, role: profile.role }, 201);
});

// @route  POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const email = normEmail(req.body.email);
  const { password } = req.body;

  // Delegate the actual credential check to GoTrue. The returned session is
  // discarded immediately after reading the user id below — this backend
  // never persists or forwards it.
  const anon = getAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });

  if (error || !data?.user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  const user = await loadUserById(data.user.id);
  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  sendAuth(res, user);
});

// @route  POST /api/auth/logout
export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(0), maxAge: undefined });
  res.json({ message: 'Logged out' });
});

// @route  GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  res.json(req.user); // set by protect() via data/supabase/loadUser.js
});

// @route  PUT /api/auth/me
export const updateMe = asyncHandler(async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const email = req.body.email != null ? normEmail(req.body.email) : undefined;
  const admin = getAdminClient();

  if (newPassword) {
    if (!currentPassword) {
      res.status(400);
      throw new Error('Please provide your current password');
    }
    // Verify the current password the same way login() does, then apply the
    // new one via the admin API (GoTrue has no "change my own password given
    // the old one" call for a server-side actor — the admin API is the
    // correct, documented way for a trusted backend to do this).
    const anon = getAnonClient();
    const { error: verifyError } = await anon.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword,
    });
    if (verifyError) {
      res.status(401);
      throw new Error('Current password is incorrect');
    }
  }

  if (email && email !== req.user.email) {
    const existing = await withUserContext(req.user._id, async (client) => {
      const r = await client.query('SELECT id FROM profiles WHERE email = $1 AND id != $2', [
        email,
        req.user._id,
      ]);
      return r.rows[0];
    });
    if (existing) {
      res.status(409);
      throw new Error('That email is already in use');
    }
  }

  const attrs = {};
  if (email) attrs.email = email;
  if (newPassword) attrs.password = newPassword;
  if (name || email) attrs.user_metadata = { ...(name ? { name } : {}) };

  if (Object.keys(attrs).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(req.user._id, attrs);
    if (error) {
      res.status(error.status || 400);
      throw new Error(error.message);
    }
  }

  // updateUserById doesn't touch `profiles` (that's a separate table) — name/
  // email there are only ever written by update_own_profile_name() (name) or
  // directly here for email, since profiles.email isn't RLS-write-restricted
  // to a dedicated RPC the way name is (see the parity map's profiles RLS
  // notes: only SELECT is policed, writes are exclusively via the two
  // SECURITY DEFINER RPCs update_own_profile_name/admin_set_role — email
  // itself is denormalized from auth.users and kept in sync here rather than
  // written directly, since no RPC exists for it and profiles has no INSERT/
  // UPDATE policy at all).
  const updated = await withUserContext(req.user._id, async (client) => {
    if (name) {
      await client.query('SELECT update_own_profile_name($1)', [name]);
    }
    const r = await client.query('SELECT id, email, name, role FROM profiles WHERE id = $1', [
      req.user._id,
    ]);
    return r.rows[0];
  });

  res.json({ _id: updated.id, name: updated.name, email: updated.email, role: updated.role });
});

// @route  POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const anon = getAnonClient();
  // Always returns success regardless of whether the email exists — GoTrue
  // itself follows the same no-enumeration contract, matching the Mongo
  // path's behavior for the same reason.
  await anon.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.CLIENT_URL || ''}/reset-password`,
  });
  res.json({ message: 'If that email is registered you will receive a reset link.' });
});

// @route  POST /api/auth/reset-password
export const resetPassword = asyncHandler(async () => {
  // Supabase Auth's reset-password flow is link-based: the emailed link
  // carries its own short-lived Supabase session token and the browser is
  // expected to call supabase-js's own updateUser({password}) directly with
  // it — there is no equivalent of the Mongo path's "POST a raw reset token
  // + new password to our own backend" contract, because GoTrue (not this
  // backend) is what validates that token. Implementing this endpoint would
  // mean either (a) changing the frontend's reset-password page to talk to
  // Supabase directly for this one flow, or (b) building a bridge endpoint
  // that exchanges the Supabase recovery token for a password update via the
  // admin API — neither is a same-API-contract adapter change, so this is
  // left as an explicit gap rather than a silent behavior mismatch.
  const err = new Error(
    'Password reset via POST /api/auth/reset-password is not supported under DATA_BACKEND=supabase yet — see docs/option-a-mongo-supabase-parity-map.md.'
  );
  err.status = 501;
  throw err;
});

// @route  GET /api/auth/link-code
export const getLinkCode = asyncHandler(async () => {
  // Stage 2F added profiles.parent_link_code/family_name (0014_close_
  // partial_gaps_schema.sql), but there is still no parent<->child linking
  // table or RPC to resolve a code back into a relationship — the column
  // exists, the feature doesn't. Left as an explicit, documented gap.
  const err = new Error(
    'Parent-child linking is not supported under DATA_BACKEND=supabase yet — see docs/option-a-mongo-supabase-parity-map.md.'
  );
  err.status = 501;
  throw err;
});

// @route  POST /api/auth/google
export const googleAuth = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400);
    throw new Error('Google credential token is required');
  }

  // Supabase Auth has native Google ID-token sign-in support, which also
  // handles audience/signature verification itself (no separate tokeninfo
  // fetch needed, unlike the Mongo path).
  const anon = getAnonClient();
  const { data, error } = await anon.auth.signInWithIdToken({
    provider: 'google',
    token: credential,
  });

  if (error || !data?.user) {
    res.status(401);
    throw new Error('Could not verify Google token');
  }

  const user = await loadUserById(data.user.id);
  if (!user) {
    res.status(401);
    throw new Error('Could not verify Google token');
  }

  sendAuth(res, user);
});
