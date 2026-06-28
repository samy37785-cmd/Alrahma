import mongoose from 'mongoose';

/**
 * Stores hashed refresh tokens with family-based rotation.
 *
 * Token family: all tokens generated in the same login session share a family ID.
 * If a used (old) token in a family is presented again, we know it was stolen —
 * the entire family is revoked immediately (Refresh Token Rotation + Reuse Detection).
 *
 * Raw tokens are NEVER stored — only their SHA-256 hash.
 * TTL index auto-deletes expired documents 24h after expiry.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    adminId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'AdminUser',
      required: true,
      index:    true,
    },
    family: {
      type:     String,
      required: true,
      index:    true,
    },
    expiresAt: { type: Date, required: true },
    usedAt:    { type: Date, default: null },   // set when rotated (one-time use)
    revoked:   { type: Boolean, default: false }, // set on logout or theft detection
    // Context (for audit / anomaly detection)
    userAgent: { type: String, default: null },
    ipAnon:    { type: String, default: null },   // GDPR-anonymized
  },
  { timestamps: true }
);

// MongoDB TTL index: removes documents 24 hours after expiresAt (housekeeping)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('RefreshToken', refreshTokenSchema);
