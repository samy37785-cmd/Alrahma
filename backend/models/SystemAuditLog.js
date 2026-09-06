import mongoose from 'mongoose';

/**
 * Immutable audit trail for every state-changing admin action.
 *
 * Stores:
 *  - who  (adminId + adminEmail denormalized for post-deletion readability)
 *  - what (action string, e.g. "user.update")
 *  - where (resource + resourceId)
 *  - before / after state (sensitive fields stripped by crudController)
 *  - context (GDPR-anonymized IP, userAgent, severity)
 *
 * Immutability is enforced via pre-hooks that throw on any update operation.
 * Deletion is only allowed via the GDPR purge endpoint (super-admin only).
 */
const systemAuditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'AdminUser',
      required: true,
      index:    true,
    },
    adminEmail: { type: String, required: true }, // denormalized
    action:     { type: String, required: true, index: true }, // e.g. 'user.update'
    resource:   { type: String, required: true, index: true }, // e.g. 'User', 'Course'
    resourceId: { type: mongoose.Schema.Types.Mixed, default: null },
    before:     { type: mongoose.Schema.Types.Mixed, default: null },
    after:      { type: mongoose.Schema.Types.Mixed, default: null },
    severity: {
      type:    String,
      enum:    ['info', 'warning', 'critical'],
      default: 'info',
      index:   true,
    },
    userAgent: { type: String, default: null },
    ipAnon:    { type: String, default: null }, // GDPR-anonymized IP
    metadata:  { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// ── Immutability guard ───────────────────────────────────────────────────────
// Block every update operation so audit records can never be silently modified.
for (const op of ['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne', 'findOneAndReplace']) {
  systemAuditLogSchema.pre(op, function () {
    throw new Error('SystemAuditLog records are immutable and cannot be modified after creation');
  });
}

export default mongoose.model('SystemAuditLog', systemAuditLogSchema);
