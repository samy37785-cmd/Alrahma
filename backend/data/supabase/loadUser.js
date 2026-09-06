// Loads a user in the same shape backend/middleware/auth.js's protect()
// expects from Mongoose (`req.user`), but sourced from `profiles` +
// `subscriptions` instead. Used only when DATA_BACKEND=supabase.
//
// Known, deliberate gaps vs. the Mongo User document (see
// docs/option-a-mongo-supabase-parity-map.md, "User / profiles" section):
//   - role is only ever 'user' or 'admin' (Postgres account_role enum) — the
//     Mongo student/teacher/parent distinction has no Postgres column, so it
//     cannot be reproduced here. Every supabase-mode account surfaces as
//     role:'user' unless profiles.role='admin'.
//   - xp/level/streak/badges (gamification), teacher/children/parentLinkCode/
//     familyName (teacher-student linking), specialization/bio/gender/
//     languages/subjects/rating (teacher profile fields), googleId,
//     referralCode have no Postgres column anywhere — all returned as null.
//   - tokenVersion has no Postgres column, so a supabase-mode account's
//     existing sessions are NOT invalidated on password change/reset the way
//     Mongo's are. protect()/softProtect() skip the version check entirely
//     for supabase-backed tokens (see middleware/auth.js).
import { withUserContext } from './client.js';

export async function loadUserById(id) {
  return withUserContext(id, async (client) => {
    const profileRes = await client.query(
      'SELECT id, email, name, role FROM profiles WHERE id = $1',
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

    return {
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
      // Documented gaps (see module comment) — not representable in Postgres yet.
      xp: null,
      level: null,
      streak: null,
      badges: [],
      teacher: null,
      children: [],
      parentLinkCode: null,
      familyName: null,
      googleId: null,
      referralCode: null,
      tokenVersion: 0,
    };
  });
}
