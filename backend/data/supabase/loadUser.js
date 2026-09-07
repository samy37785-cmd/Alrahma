// Loads a user in the same shape backend/middleware/auth.js's protect()
// expects from Mongoose (`req.user`), but sourced from `profiles` +
// `subscriptions` instead. Used only when DATA_BACKEND=supabase.
//
// Known, deliberate gaps vs. the Mongo User document (see
// docs/option-a-mongo-supabase-parity-map.md, "User / profiles" section):
//   - role is only ever 'user' or 'admin' (Postgres account_role enum) — the
//     Mongo student/teacher/parent distinction has no Postgres column, so it
//     cannot be reproduced here. Every supabase-mode account surfaces as
//     role:'user' unless profiles.role='admin'. The Stage 2F `teacher_id`
//     self-FK on profiles represents "this student's assigned teacher" as a
//     relationship, not a role — a real, deliberately different mechanism
//     (see live_classes/messages/student_records RLS in 0015).
//   - xp/level/streak/badges/teacher_id/parent_link_code/family_name/
//     specialization/bio/gender/languages/subjects were closed in Stage 2F
//     (0014_close_partial_gaps_schema.sql) and are now real columns, wired
//     in below. `children` (a parent's linked students) and `rating`
//     (aggregate review score) still have no representation here — no
//     parent-linking table/RPC and no reviews-aggregate view were built —
//     and remain real, documented gaps. googleId has no Postgres column
//     (Supabase Auth's identity linking replaces it entirely; a Google-
//     authenticated account's own auth.users id is the identity, there is
//     nothing further to expose).
//   - tokenVersion has no Postgres column, so a supabase-mode account's
//     existing sessions are NOT invalidated on password change/reset the way
//     Mongo's are. protect()/softProtect() skip the version check entirely
//     for supabase-backed tokens (see middleware/auth.js).
import { withUserContext } from './client.js';

// Same logic as models/User.js's hasActiveSubscription() instance method,
// operating on the plain subscription sub-object this module returns
// instead of a Mongoose document. Exported separately so a controller can
// call it directly; also attached below as a bound method on the returned
// user object so the many existing call sites written against the Mongo
// contract (req.user.hasActiveSubscription()) keep working unchanged
// regardless of backend.
export function hasActiveSubscription(user) {
  const s = user?.subscription;
  if (!s || s.status !== 'active') return false;
  if (!s.validUntil) return false;
  return new Date(s.validUntil).getTime() > Date.now();
}

export async function loadUserById(id) {
  return withUserContext(id, async (client) => {
    const profileRes = await client.query(
      `SELECT id, email, name, role, referral_code, xp, level, streak, last_study_date,
              badges, teacher_id, parent_link_code, family_name, specialization, bio,
              gender, languages, subjects
         FROM profiles WHERE id = $1`,
      [id]
    );
    const profile = profileRes.rows[0];
    if (!profile) return null;

    const subRes = await client.query(
      `SELECT s.status, s.current_period_end, s.provider, s.cancel_at_period_end, p.slug AS plan_slug
         FROM subscriptions s
         LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.user_id = $1 AND s.status IN ('active','past_due')
        ORDER BY s.created_at DESC
        LIMIT 1`,
      [id]
    );
    const sub = subRes.rows[0];

    const user = {
      _id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      subscription: sub
        ? {
            plan: sub.plan_slug,
            status: sub.status === 'active' ? 'active' : 'inactive',
            validUntil: sub.current_period_end,
            provider: sub.provider,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          }
        : { plan: null, status: 'inactive', validUntil: null },
      xp: profile.xp,
      level: profile.level,
      streak: profile.streak,
      lastStudyDate: profile.last_study_date,
      badges: profile.badges ?? [],
      teacher: profile.teacher_id,
      // No parent-linking table/RPC exists yet — a real, documented gap
      // (see module comment) — a student's own parent_link_code is real,
      // but resolving it back to a list of linked parent accounts is not.
      children: [],
      parentLinkCode: profile.parent_link_code,
      familyName: profile.family_name,
      specialization: profile.specialization,
      bio: profile.bio,
      gender: profile.gender,
      languages: profile.languages ?? [],
      subjects: profile.subjects ?? [],
      googleId: null,
      referralCode: profile.referral_code,
      tokenVersion: 0,
    };
    // Bound method so existing call sites (req.user.hasActiveSubscription())
    // keep working unchanged under this backend too.
    user.hasActiveSubscription = () => hasActiveSubscription(user);
    return user;
  });
}
