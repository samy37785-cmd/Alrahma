// GoTrue's MFA enroll/challenge/verify API is only exposed on a live,
// per-user session client (there is no admin/service-role equivalent) — see
// data/supabase/adminAuthController.js's module comment for why the pre-auth
// admin_at cookie carries a Supabase session (access+refresh token) across
// the login -> mfa/setup -> mfa/confirm request sequence. This helper turns
// that pair back into a usable supabase-js client for exactly that purpose.
//
// Never used for anything other than the admin MFA flow: it is not a
// substitute for withUserContext (Postgres RLS) and it is not persisted
// anywhere beyond the short-lived, httpOnly pre-auth cookie itself.
import { createClient } from '@supabase/supabase-js';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required when DATA_BACKEND=supabase`);
  return v;
}

export async function createAdminSessionClient(accessToken, refreshToken) {
  const client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return client;
}
