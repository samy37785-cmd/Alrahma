// One-off migration: populates `referralCode` (last 8 chars of _id) on every
// existing User document that doesn't have one yet. Not required for
// correctness — referralController.trackReferral() self-heals this field
// lazily the first time a legacy user's referral code is used — but running
// this once immediately eliminates the scan-based fallback path entirely
// instead of waiting for it to shrink organically.
// Run with:  npm run backfill:referral-codes
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import User from '../models/User.js';

dotenv.config();

async function backfillReferralCodes() {
  await connectDB();
  try {
    const users = await User.find({ referralCode: null }).select('_id').lean();
    console.log(`Found ${users.length} user(s) without a referralCode.`);

    let updated = 0;
    for (const u of users) {
      const referralCode = u._id.toString().slice(-8);
      await User.updateOne({ _id: u._id }, { $set: { referralCode } });
      updated += 1;
    }
    console.log(`✅ Backfilled referralCode on ${updated} user(s).`);
  } catch (err) {
    console.error('❌ Backfill error:', err.message);
  } finally {
    process.exit();
  }
}

backfillReferralCodes();
