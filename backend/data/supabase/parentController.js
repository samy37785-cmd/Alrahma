// DATA_BACKEND=supabase controller for the parent-linking domain. Stage 2F
// added profiles.parent_link_code/family_name (0014_close_partial_gaps_
// schema.sql) but built no parent<->child linking table or RPC — there is
// no Postgres representation of "which parent accounts are linked to which
// student accounts" at all. Rather than leaving these routes unmounted
// (which would fall through to the Mongo controller and hang/error with no
// MongoDB connection under this backend), every handler here fails cleanly
// and explicitly instead — consistent with the same documented-gap pattern
// used by data/supabase/authController.js's resetPassword/getLinkCode.
import { asyncHandler } from '../../utils/asyncHandler.js';

const notImplemented = asyncHandler(async () => {
  const err = new Error(
    'Parent-child account linking is not supported under DATA_BACKEND=supabase yet — no linking ' +
      'table/RPC exists (profiles.parent_link_code/family_name are the only columns Stage 2F added). ' +
      'See docs/option-a-mongo-supabase-parity-map.md before implementing this.'
  );
  err.status = 501;
  throw err;
});

export const linkChild = notImplemented;
export const getChildren = notImplemented;
export const getChildDetail = notImplemented;
export const unlinkChild = notImplemented;
