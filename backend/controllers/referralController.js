import Referral from '../models/Referral.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditFromReq } from '../services/auditService.js';

// @desc  Get the authenticated user's referral stats (code + referral list)
// @route GET /api/referrals/me
// @access Private
export const getMyReferrals = asyncHandler(async (req, res) => {
  const code = req.user._id.toString().slice(-8);

  const referrals = await Referral.find({ referrer: req.user._id })
    .populate('referee', 'name createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const stats = {
    code,
    link: `${process.env.CLIENT_URL?.split(',')[0] || 'https://alrahmaacademy.com'}/enroll?ref=${code}`,
    total:     referrals.length,
    converted: referrals.filter((r) => ['converted', 'rewarded'].includes(r.status)).length,
    rewarded:  referrals.filter((r) => r.status === 'rewarded').length,
    referrals: referrals.map((r) => ({
      id:          r._id,
      refereeName: r.referee?.name || 'Pending registration',
      status:      r.status,
      joinedAt:    r.referee?.createdAt,
      convertedAt: r.convertedAt,
    })),
  };

  res.json(stats);
});

// @desc  Record a referral when a user registers via a ref code
// @route POST /api/referrals/track
// @body  { code }
// @access Private — the referee can only ever be the caller's own account.
// SECURITY: refereeId used to be taken from the request body with no
// authentication at all, so any anonymous caller could attribute an
// arbitrary user's account to any referral code they chose. It's now
// derived from the authenticated session instead, so a caller can only ever
// record a referral for themselves.
export const trackReferral = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const refereeId = req.user._id;
  if (!code) { res.status(400); throw new Error('code is required'); }

  // Fast path: referralCode is indexed (unique, sparse), so this is a single
  // targeted lookup rather than a full collection scan.
  let referrer = await User.findOne({ referralCode: code }).select('_id').lean();

  // Self-healing fallback for users created before the referralCode field
  // existed: their code was never persisted, so fall back to the original
  // derivation (last 8 chars of _id) — but only scan users who don't have a
  // referralCode yet, and persist it once found so this user never needs the
  // scan again. Identical business behavior to before this change; the
  // scanned set shrinks over time instead of being every user, forever.
  if (!referrer) {
    const unmigrated = await User.find({ referralCode: null }).select('_id').lean();
    const legacyMatch = unmigrated.find((u) => u._id.toString().slice(-8) === code);
    if (legacyMatch) {
      await User.updateOne({ _id: legacyMatch._id }, { $set: { referralCode: code } });
      referrer = legacyMatch;
    }
  }

  if (!referrer) { res.status(404); throw new Error('Referral code not found'); }
  if (referrer._id.toString() === refereeId.toString()) {
    return res.status(400).json({ message: 'Self-referral is not allowed' });
  }

  const existing = await Referral.findOne({ referrer: referrer._id, referee: refereeId }).lean();
  if (existing) return res.json(existing);

  const referral = await Referral.create({ referrer: referrer._id, referee: refereeId, code });
  res.status(201).json(referral);
});

// @desc  Mark a referral as converted (called when a referee subscribes)
// @route PATCH /api/referrals/:id/convert
// @access Admin / Internal
export const convertReferral = asyncHandler(async (req, res) => {
  const referral = await Referral.findById(req.params.id);
  if (!referral) { res.status(404); throw new Error('Referral not found'); }
  if (referral.status !== 'pending') return res.json(referral);

  referral.status      = 'converted';
  referral.convertedAt = new Date();
  await referral.save();

  await auditFromReq(req, 'referral.convert', 'Referral', referral._id, { status: 'pending' }, referral, 'info');

  res.json(referral);
});
