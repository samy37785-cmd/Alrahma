// DATA_BACKEND=supabase controller for referrals. Mirrors
// controllers/referralController.js's routes/response shapes for
// getMyReferrals/trackReferral. convertReferral is an admin mutation gated
// by is_admin_aal2() + authorize('referrals:write') — no admin-router
// adapter wires it up yet (documented gap).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

// @route GET /api/referrals/me
// @access Private
export const getMyReferrals = asyncHandler(async (req, res) => {
  const { code, rows } = await withUserContext(req.user._id, async (client) => {
    const codeRes = await client.query('SELECT ensure_referral_code() AS code');
    const listRes = await client.query(
      `SELECT r.id, r.status, r.converted_at, p.name AS referee_name, p.created_at AS referee_joined_at
         FROM referrals r
         LEFT JOIN profiles p ON p.id = r.referee_id
        WHERE r.referrer_id = $1
        ORDER BY r.created_at DESC
        LIMIT 50`,
      [req.user._id]
    );
    return { code: codeRes.rows[0].code, rows: listRes.rows };
  });

  res.json({
    code,
    link: `${process.env.CLIENT_URL?.split(',')[0] || 'https://alrahmaacademy.com'}/enroll?ref=${code}`,
    total: rows.length,
    converted: rows.filter((r) => ['converted', 'rewarded'].includes(r.status)).length,
    rewarded: rows.filter((r) => r.status === 'rewarded').length,
    referrals: rows.map((r) => ({
      id: r.id,
      refereeName: r.referee_name || 'Pending registration',
      status: r.status,
      joinedAt: r.referee_joined_at,
      convertedAt: r.converted_at,
    })),
  });
});

// @route POST /api/referrals/track
// @access Private
export const trackReferral = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) {
    res.status(400);
    throw new Error('code is required');
  }

  try {
    const row = await withUserContext(req.user._id, async (client) => {
      const r = await client.query('SELECT * FROM track_referral($1)', [code]);
      return r.rows[0];
    });
    res.status(201).json({
      _id: row.id,
      referrer: row.referrer_id,
      referee: row.referee_id,
      code: row.code,
      status: row.status,
      convertedAt: row.converted_at,
      createdAt: row.created_at,
    });
  } catch (err) {
    if (/unknown_referral_code/.test(err.message)) {
      res.status(404);
      throw new Error('Referral code not found');
    }
    if (/self_referral_not_allowed/.test(err.message)) {
      return res.status(400).json({ message: 'Self-referral is not allowed' });
    }
    throw err;
  }
});
