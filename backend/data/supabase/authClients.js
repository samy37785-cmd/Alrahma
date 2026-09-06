// Supabase Auth (GoTrue) clients — used only for credential
// verification/creation, never for data access (that goes through
// client.js's RLS-impersonating `pg` pool). Passwords are Supabase Auth's
// responsibility (auth.users, managed internally), not something this
// backend ever hashes or compares itself under DATA_BACKEND=supabase.
import { createClient } from '@supabase/supabase-js';

let adminClient;
let anonClient;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required when DATA_BACKEND=supabase`);
  return v;
}

// Service-role client: server-side only, never sent to the browser. Used to
// create accounts (auth.admin.createUser) and to send password-reset emails
// on demand. Holding this key is exactly as sensitive as MONGO_URI/
// JWT_SECRET — it must never appear in logs or client-facing responses.
export function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

// Anon-key client: used only to call signInWithPassword, i.e. to ask GoTrue
// "is this email/password combination correct?". The session it returns is
// discarded immediately after reading the resulting user id — this backend
// mints and cookies its own JWT (same contract as the Mongo path), it does
// not persist or forward the Supabase session itself.
export function getAnonClient() {
  if (!anonClient) {
    anonClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}
