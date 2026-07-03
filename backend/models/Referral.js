import mongoose from 'mongoose';

/*
  Referral: tracks who referred whom and the reward state.

  Flow:
    1. Referrer shares link with ?ref=<code>
    2. Friend registers → Referral doc created (status: pending)
    3. Friend subscribes → status → converted; both parties get 1-month credit
    4. Admin/cron sets status → rewarded after credit is applied
*/
const referralSchema = new mongoose.Schema(
  {
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referee:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    // Short code = last 8 chars of referrer's _id; stable across sessions
    code: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ['pending', 'converted', 'rewarded', 'expired'],
      default: 'pending',
    },

    // ISO date when the referee completed a paid subscription
    convertedAt: { type: Date },
    rewardedAt:  { type: Date },
  },
  { timestamps: true }
);

referralSchema.index({ referrer: 1, referee: 1 }, { unique: true, sparse: true });

export default mongoose.model('Referral', referralSchema);
