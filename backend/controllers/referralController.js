import Referral from '../models/Referral.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// @desc  Get the authenticated user's referral stats (code + referral list)
// @route GET /api/referrals/me
// @access Private
export const getMyReferrals = asyncHandler(async (req, res) => {
  const code = req.user._id.toString().slice(-8);

  const referrals = await Referral.find({ referrer: req.user._id })
    .populate('referee', 'name createdAt')
    .sort({ createdAt: -1 })
    .limit(50);

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
// @body  { code, refereeId }
// @access Internal (called server-side during registration)
export const trackReferral = asyncHandler(async (req, res) => {
  const { code, refereeId } = req.body;
  if (!code || !refereeId) { res.status(400); throw new Error('code and refereeId required'); }

  // Find the referrer by matching the last 8 chars of their _id
  const users = await User.find({}).select('_id').lean();
  const referrer = users.find((u) => u._id.toString().slice(-8) === code);
  if (!referrer) { res.status(404); throw new Error('Referral code not found'); }
  if (referrer._id.toString() === refereeId) {
    return res.status(400).json({ message: 'Self-referral is not allowed' });
  }

  const existing = await Referral.findOne({ referrer: referrer._id, referee: refereeId });
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

  res.json(referral);
});
