// Production-readiness audit follow-up (2026-09-17): /community and
// /ai-tutor (plus the admin Community moderation tab) are fully built
// frontend features with NO backend implementation on either data backend
// (backend/, backend/data/supabase/) — every request they make 404s. Kept
// as closed-by-default feature flags rather than deleting the pages, so the
// UI work isn't lost and turning them on later (once a real backend exists)
// is a one-line env change, not a revert.
//
// Set VITE_ENABLE_UNFINISHED_FEATURES=true in the frontend build env to
// turn these back on for local development against a backend that actually
// implements them.
const unfinishedFeaturesEnabled = import.meta.env.VITE_ENABLE_UNFINISHED_FEATURES === 'true';

export const FEATURES = {
  community: unfinishedFeaturesEnabled,
  aiTutor: unfinishedFeaturesEnabled,
};
