import mongoose from 'mongoose';

/**
 * One document per refresh-token family (a login session's chain of
 * rotated tokens). Exists purely to make family-compromise a single,
 * atomically-readable fact instead of something inferred by re-querying
 * the RefreshToken collection — see adminAuthController.js's
 * issueRefreshToken()/refreshTokens() for the race this closes: without
 * this flag, a token minted concurrently with a reuse-detection sweep
 * could be created just after the sweep's query ran, and never get
 * caught by it.
 */
const tokenFamilySchema = new mongoose.Schema(
  {
    family: {
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
    revoked:   { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    // Review follow-up: one document is created per login and, without any
    // lifecycle policy, this collection would grow forever — every admin
    // login, ever, leaves a row behind permanently. lastActivityAt is
    // bumped (see adminAuthController.js's issueRefreshToken()) on every
    // successful refresh-token rotation for this family, NOT fixed at
    // creation time, specifically so a long-lived, actively-used admin
    // session (refreshed well within its RefreshToken's own 7-day window,
    // indefinitely) keeps pushing its own TTL forward and never expires
    // out from under itself. Only a family that genuinely goes dormant —
    // revoked, or simply never rotated again — ages out.
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// TTL index: removes a family 10 days after its last rotation/creation/
// revocation-write with no further activity. Chosen deliberately longer
// than a RefreshToken document's own maximum possible lifetime (7-day
// expiresAt + RefreshToken's own 24h TTL grace period = 8 days from that
// token's issuance — see models/RefreshToken.js) — so by the time a
// TokenFamily row is ever actually removed, every RefreshToken document
// that ever belonged to it is already long gone too, and this can never
// fire while a family is still genuinely reachable/in use.
tokenFamilySchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 10 * 24 * 60 * 60 });

export default mongoose.model('TokenFamily', tokenFamilySchema);
