// Stage 2E: swappable data-backend selector. MongoDB remains the default and
// the only backend actually deployed to production — DATA_BACKEND=supabase
// exists so the Supabase adapter (backend/data/supabase/) can be developed,
// contract-tested, and rehearsed locally without touching the live routes at
// all. See docs/option-a-mongo-supabase-parity-map.md for what the Supabase
// adapter does and does not cover.
const VALID_BACKENDS = ['mongodb', 'supabase'];

export function getDataBackend() {
  const raw = (process.env.DATA_BACKEND || 'mongodb').trim().toLowerCase();
  if (!VALID_BACKENDS.includes(raw)) {
    throw new Error(
      `Invalid DATA_BACKEND "${raw}" — must be one of: ${VALID_BACKENDS.join(', ')}`
    );
  }
  return raw;
}

export function isSupabaseBackend() {
  return getDataBackend() === 'supabase';
}
